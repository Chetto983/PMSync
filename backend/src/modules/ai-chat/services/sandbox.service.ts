import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compute, type Sandbox as ComputeSandbox } from 'computesdk';

/**
 * SandboxService -- Production-safe isolated code execution via ComputeSDK.
 *
 * Uses ComputeSDK gateway with Railway provider for real container isolation.
 * Each tenant gets a namespaced sandbox (findOrCreate) for horizontal scaling.
 *
 * Supports JavaScript (Node.js) and Python runtimes.
 * Sandboxes are ephemeral containers with no access to host APIs or secrets.
 */

export interface ExecuteCodeParams {
  code: string;
  language: 'python' | 'javascript';
  timeout?: number;
  inputData?: string;
  tenantId?: string;
}

export interface ExecuteCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Max output characters per execution */
const MAX_OUTPUT_CHARS = 16_000;

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Sandbox name prefix */
const SANDBOX_NAME = 'pmsync-exec';

@Injectable()
export class SandboxService implements OnModuleInit {
  private readonly logger = new Logger(SandboxService.name);
  private configured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKey = this.config.get<string>('COMPUTESDK_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'COMPUTESDK_API_KEY not set — sandbox execution will be unavailable',
      );
      return;
    }

    compute.setConfig({
      provider: 'railway',
      computesdkApiKey: apiKey,
      railway: {
        apiToken: this.config.get<string>('RAILWAY_API_KEY'),
        projectId: this.config.get<string>('RAILWAY_PROJECT_ID'),
        environmentId: this.config.get<string>('RAILWAY_ENVIRONMENT_ID'),
      },
    });

    this.configured = true;
    this.logger.log('ComputeSDK configured with Railway provider');
  }

  async executeCode(params: ExecuteCodeParams): Promise<ExecuteCodeResult> {
    const {
      code,
      language,
      timeout,
      inputData,
      tenantId = 'default',
    } = params;

    if (!this.configured) {
      return {
        stdout: '',
        stderr: 'Sandbox execution is not available — COMPUTESDK_API_KEY not configured.',
        exitCode: 1,
      };
    }

    const timeoutMs = Math.min(timeout ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const runtime = language === 'python' ? 'python' as const : 'node' as const;

    let sandbox: ComputeSandbox | null = null;

    try {
      // Tenant-namespaced sandbox: reuse if exists, create if not
      sandbox = await compute.sandbox.findOrCreate({
        name: SANDBOX_NAME,
        namespace: `tenant-${tenantId}`,
        timeout: timeoutMs,
      });

      // Write input data to sandbox filesystem if provided
      const inputPath = '/tmp/input.txt';
      if (inputData) {
        await sandbox.filesystem.writeFile(inputPath, inputData);
      }

      // Wrap code to inject INPUT_DATA_PATH variable
      const wrappedCode = inputData
        ? this.wrapWithInputPath(code, language, inputPath)
        : code;

      // Execute code in the sandbox
      const result = await sandbox.runCode(wrappedCode, runtime);

      return {
        stdout: (result.output ?? '').slice(0, MAX_OUTPUT_CHARS),
        stderr: '',
        exitCode: result.exitCode ?? 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sandbox execution failed: ${message}`);

      // Check for timeout-like errors
      if (message.toLowerCase().includes('timeout')) {
        return {
          stdout: '',
          stderr: `Execution timed out after ${timeoutMs}ms`,
          exitCode: 124,
        };
      }

      return {
        stdout: '',
        stderr: message.slice(0, 4_000),
        exitCode: 1,
      };
    }
  }

  /**
   * Wrap user code to inject INPUT_DATA_PATH as a variable.
   */
  private wrapWithInputPath(
    code: string,
    language: 'python' | 'javascript',
    inputPath: string,
  ): string {
    if (language === 'python') {
      return `INPUT_DATA_PATH = "${inputPath}"\n${code}`;
    }
    return `const INPUT_DATA_PATH = "${inputPath}";\n${code}`;
  }
}

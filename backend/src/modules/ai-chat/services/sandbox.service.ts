import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sandbox as ComputeSandbox } from 'computesdk';

/**
 * SandboxService -- Production-safe isolated code execution via ComputeSDK.
 *
 * Connects directly to the ComputeSDK sandbox service deployed on Railway.
 * Uses the Sandbox class with access token auth for code execution.
 *
 * Supports JavaScript (Node.js) and Python runtimes.
 * The sandbox is an isolated container with no access to host APIs or secrets.
 *
 * Required env vars:
 * - COMPUTESDK_ACCESS_TOKEN: JWT from the compute service
 * - COMPUTESDK_SANDBOX_URL: Sandbox URL (or RAILWAY_PRIVATE_DOMAIN for internal)
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

@Injectable()
export class SandboxService implements OnModuleInit {
  private readonly logger = new Logger(SandboxService.name);
  private sandbox: ComputeSandbox | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    // Try direct connection to compute service (Railway internal or public URL)
    const accessToken = this.config.get<string>('COMPUTESDK_ACCESS_TOKEN');
    const sandboxUrl =
      this.config.get<string>('COMPUTESDK_SANDBOX_URL') ||
      this.config.get<string>('COMPUTESDK_SANDBOX_PUBLIC_URL');

    if (!accessToken || !sandboxUrl) {
      this.logger.warn(
        'COMPUTESDK_ACCESS_TOKEN or COMPUTESDK_SANDBOX_URL not set — sandbox execution unavailable',
      );
      return;
    }

    // Extract sandbox ID from the URL (e.g., "reluctant-seahorse-rvynzg" from the JWT)
    const sandboxId = this.extractSandboxId(accessToken);

    this.sandbox = new ComputeSandbox({
      sandboxUrl,
      sandboxId: sandboxId || 'default',
      provider: 'railway',
      token: accessToken,
    });

    this.logger.log(`ComputeSDK sandbox connected: ${sandboxUrl}`);
  }

  async executeCode(params: ExecuteCodeParams): Promise<ExecuteCodeResult> {
    const {
      code,
      language,
      timeout,
      inputData,
    } = params;

    if (!this.sandbox) {
      return {
        stdout: '',
        stderr: 'Sandbox execution is not available — ComputeSDK not configured.',
        exitCode: 1,
      };
    }

    const timeoutMs = Math.min(timeout ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const runtime = language === 'python' ? 'python' as const : 'node' as const;

    try {
      // Write input data to sandbox filesystem if provided
      const inputPath = '/tmp/input.txt';
      if (inputData) {
        await this.sandbox.filesystem.writeFile(inputPath, inputData);
      }

      // Wrap code to inject INPUT_DATA_PATH variable
      const wrappedCode = inputData
        ? this.wrapWithInputPath(code, language, inputPath)
        : code;

      // Execute code in the sandbox
      const result = await this.sandbox.runCode(wrappedCode, runtime);

      return {
        stdout: (result.output ?? '').slice(0, MAX_OUTPUT_CHARS),
        stderr: '',
        exitCode: result.exitCode ?? 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sandbox execution failed: ${message}`);

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
   * Extract sandbox_id from JWT access token payload.
   */
  private extractSandboxId(token: string): string | null {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      return payload.sandbox_id || null;
    } catch {
      return null;
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

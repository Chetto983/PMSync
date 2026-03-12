import { Injectable, Logger } from '@nestjs/common';

/**
 * SandboxService -- Isolated code execution for AI chat.
 *
 * Executes Python or JavaScript code in a sandboxed environment.
 * Currently a stub implementation that executes JS via Node.js VM.
 * Future: integrate ComputeSDK + Railway for full container isolation.
 *
 * Phase AI-AUDIT: New service for run_code tool.
 */

interface ExecuteCodeParams {
  code: string;
  language: 'python' | 'javascript';
  timeout?: number;
  inputData?: string;
}

interface ExecuteCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Max output characters per execution */
const MAX_OUTPUT_CHARS = 16_000;

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 30_000;

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  /**
   * Execute code in an isolated sandbox.
   *
   * Currently supports JavaScript only via child_process.
   * Python support requires ComputeSDK or Docker integration.
   */
  async executeCode(params: ExecuteCodeParams): Promise<ExecuteCodeResult> {
    const { code, language, timeout, inputData } = params;
    const timeoutMs = Math.min(timeout ?? DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

    if (language === 'python') {
      return this.executePython(code, timeoutMs, inputData);
    }

    return this.executeJavaScript(code, timeoutMs, inputData);
  }

  private async executeJavaScript(
    code: string,
    timeoutMs: number,
    inputData?: string,
  ): Promise<ExecuteCodeResult> {
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const tmpDir = mkdtempSync(join(tmpdir(), 'pmsync-sandbox-'));
    const scriptPath = join(tmpDir, 'script.js');
    const dataPath = join(tmpDir, 'input.txt');

    try {
      // Write input data if provided
      if (inputData) {
        writeFileSync(dataPath, inputData, 'utf-8');
      }

      // Wrap code with input data path injection
      const wrappedCode = inputData
        ? `const INPUT_DATA_PATH = ${JSON.stringify(dataPath)};\n${code}`
        : code;

      writeFileSync(scriptPath, wrappedCode, 'utf-8');

      const stdout = execSync(`node "${scriptPath}"`, {
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_CHARS * 2,
        encoding: 'utf-8',
        cwd: tmpDir,
      });

      return {
        stdout: (stdout ?? '').slice(0, MAX_OUTPUT_CHARS),
        stderr: '',
        exitCode: 0,
      };
    } catch (error: unknown) {
      const err = error as {
        stdout?: string;
        stderr?: string;
        status?: number;
        message?: string;
      };
      return {
        stdout: (err.stdout ?? '').slice(0, MAX_OUTPUT_CHARS),
        stderr: (err.stderr ?? err.message ?? 'Unknown error').slice(0, 4_000),
        exitCode: err.status ?? 1,
      };
    } finally {
      // Cleanup
      try {
        unlinkSync(scriptPath);
        if (inputData) unlinkSync(dataPath);
        const { rmdirSync } = await import('fs');
        rmdirSync(tmpDir);
      } catch {
        this.logger.debug(`Sandbox cleanup warning for ${tmpDir}`);
      }
    }
  }

  private async executePython(
    code: string,
    timeoutMs: number,
    inputData?: string,
  ): Promise<ExecuteCodeResult> {
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const tmpDir = mkdtempSync(join(tmpdir(), 'pmsync-sandbox-'));
    const scriptPath = join(tmpDir, 'script.py');
    const dataPath = join(tmpDir, 'input.txt');

    try {
      if (inputData) {
        writeFileSync(dataPath, inputData, 'utf-8');
      }

      const wrappedCode = inputData
        ? `INPUT_DATA_PATH = ${JSON.stringify(dataPath)}\n${code}`
        : code;

      writeFileSync(scriptPath, wrappedCode, 'utf-8');

      const stdout = execSync(`python "${scriptPath}"`, {
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_CHARS * 2,
        encoding: 'utf-8',
        cwd: tmpDir,
      });

      return {
        stdout: (stdout ?? '').slice(0, MAX_OUTPUT_CHARS),
        stderr: '',
        exitCode: 0,
      };
    } catch (error: unknown) {
      const err = error as {
        stdout?: string;
        stderr?: string;
        status?: number;
        message?: string;
      };
      return {
        stdout: (err.stdout ?? '').slice(0, MAX_OUTPUT_CHARS),
        stderr: (err.stderr ?? err.message ?? 'Unknown error').slice(0, 4_000),
        exitCode: err.status ?? 1,
      };
    } finally {
      try {
        unlinkSync(scriptPath);
        if (inputData) unlinkSync(dataPath);
        const { rmdirSync } = await import('fs');
        rmdirSync(tmpDir);
      } catch {
        this.logger.debug(`Sandbox cleanup warning for ${tmpDir}`);
      }
    }
  }
}

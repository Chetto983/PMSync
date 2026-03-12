import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { SandboxService } from '../services/sandbox.service';
import { truncateToolResult } from '../utils/tool-result-truncator';

/**
 * SandboxToolsService -- Code execution tool for AI chat.
 *
 * Tools: run_code
 *
 * Executes Python or JavaScript code in an isolated sandbox
 * for data analysis, calculations, and data processing tasks.
 *
 * Phase AI-AUDIT: New tool for code execution capability.
 */
@Injectable()
export class SandboxToolsService {
  private readonly logger = new Logger(SandboxToolsService.name);

  constructor(private readonly sandboxService: SandboxService) {}

  /**
   * Returns sandbox tools.
   */
  getTools() {
    return {
      run_code: this.buildRunCode(),
    };
  }

  private buildRunCode() {
    return tool({
      description:
        'Execute Python or JavaScript code in an isolated sandbox. ' +
        'Use for: data analysis, calculations, CSV/JSON processing, date math, generating tables. ' +
        'Do NOT use for: sending emails, modifying contacts, or any action with side effects — the sandbox has no access to user data or APIs. ' +
        'You must pass any data the code needs via the inputData parameter. ' +
        'Python has standard library available. JavaScript runs in Node.js. ' +
        'Output is captured from stdout (use print() or console.log()). ' +
        'Timeout: 30 seconds. Max output: 16,000 characters. ' +
        'Returns: { stdout, stderr, exitCode, success }.',
      inputSchema: z.object({
        code: z.string().describe('The code to execute'),
        language: z
          .enum(['python', 'javascript'])
          .describe('Programming language'),
        inputData: z
          .string()
          .optional()
          .describe(
            'Optional data to pass to the code. Available as INPUT_DATA_PATH variable pointing to a temp file.',
          ),
      }),
      execute: async (args) => {
        this.logger.debug(
          `run_code: ${args.language}, ${args.code.length} chars`,
        );

        const result = await this.sandboxService.executeCode({
          code: args.code,
          language: args.language,
          inputData: args.inputData,
        });

        return truncateToolResult({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          success: result.exitCode === 0,
        });
      },
    });
  }
}

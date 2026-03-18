import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool, generateText } from 'ai';
import { z } from 'zod';
import { SandboxService } from '../services/sandbox.service';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

/**
 * SandboxToolsService -- Code execution tools for AI chat.
 *
 * Tools: run_code, code_assistant
 *
 * - run_code: Direct code execution (agent writes the code)
 * - code_assistant: Devstral generates code from a task description, then executes it
 *
 * Both execute in an isolated sandbox with no API access.
 */
const schemas = {
  run_code: z.object({
    code: z.string().describe('The code to execute'),
    language: z.enum(['python', 'javascript']).describe('Programming language'),
    inputData: z.string().optional().describe('Optional data to pass to the code.'),
  }),
  code_assistant: z.object({
    task: z.string().describe('Natural language description of what the code should do.'),
    language: z.enum(['python', 'javascript']).default('javascript').describe('Preferred language (default: javascript)'),
    inputData: z.string().optional().describe('Data to process.'),
  }),
};

@Injectable()
export class SandboxToolsService implements OnModuleInit {
  private readonly logger = new Logger(SandboxToolsService.name);

  constructor(
    private readonly sandboxService: SandboxService,
    private readonly mistralProvider: MistralProviderService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'run_code', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.run_code },
      { name: 'code_assistant', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.code_assistant },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name, description: t.name, parameters: {}, execute: noop,
        domain: 'system', riskLevel: t.riskLevel, requiresApproval: t.requiresApproval, inputSchema: t.inputSchema,
      });
    }
  }

  /**
   * Returns sandbox tools scoped to a tenant.
   */
  getTools(tenantId?: string) {
    return {
      run_code: this.buildRunCode(tenantId),
      code_assistant: this.buildCodeAssistant(tenantId),
    };
  }

  private buildRunCode(tenantId?: string) {
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
      inputSchema: schemas.run_code,
      execute: async (args) => {
        this.logger.debug(
          `run_code: ${args.language}, ${args.code.length} chars`,
        );

        const result = await this.sandboxService.executeCode({
          code: args.code,
          language: args.language,
          inputData: args.inputData,
          tenantId,
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

  private buildCodeAssistant(tenantId?: string) {
    return tool({
      description:
        'Delegate a coding task to Devstral, a specialized coding AI. ' +
        'Devstral writes the code and it runs automatically in the sandbox. ' +
        'Use when: the task requires non-trivial code (data analysis, formatting, calculations, parsing). ' +
        'Prefer over run_code when you would need complex logic. ' +
        'Pass any data the code needs via the inputData parameter. ' +
        'Returns: { stdout, stderr, exitCode, success, generatedCode }.',
      inputSchema: schemas.code_assistant,
      execute: async (args) => {
        this.logger.debug(`code_assistant: "${args.task.slice(0, 80)}..."`);

        try {
          // Step 1: Generate code with Devstral
          const code = await this.generateCode(
            args.task,
            args.language,
            !!args.inputData,
          );

          if (!code) {
            return truncateToolResult({
              success: false,
              error: 'Devstral failed to generate code',
            });
          }

          // Step 2: Execute in sandbox
          const result = await this.sandboxService.executeCode({
            code,
            language: args.language,
            inputData: args.inputData,
            tenantId,
          });

          // Step 3: If failed, retry once with error context
          if (result.exitCode !== 0) {
            this.logger.debug(
              `code_assistant: first attempt failed, retrying with error context`,
            );

            const fixedCode = await this.generateCode(
              args.task,
              args.language,
              !!args.inputData,
              { code, error: result.stderr },
            );

            if (fixedCode) {
              const retryResult = await this.sandboxService.executeCode({
                code: fixedCode,
                language: args.language,
                inputData: args.inputData,
                tenantId,
              });

              return truncateToolResult({
                stdout: retryResult.stdout,
                stderr: retryResult.stderr,
                exitCode: retryResult.exitCode,
                success: retryResult.exitCode === 0,
                generatedCode: fixedCode,
                retried: true,
              });
            }
          }

          return truncateToolResult({
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            success: result.exitCode === 0,
            generatedCode: code,
          });
        } catch (error) {
          this.logger.error(
            `code_assistant failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return truncateToolResult({
            success: false,
            error: error instanceof Error ? error.message : 'Code generation failed',
          });
        }
      },
    });
  }

  /**
   * Call Devstral to generate code for a task.
   */
  private async generateCode(
    task: string,
    language: 'python' | 'javascript',
    hasInputData: boolean,
    previousAttempt?: { code: string; error: string },
  ): Promise<string | null> {
    const runtime = language === 'python' ? 'Python 3' : 'Node.js';
    const readVar =
      language === 'python'
        ? 'INPUT_DATA_PATH (Python variable with file path)'
        : 'INPUT_DATA_PATH (JS const with file path)';

    let prompt =
      `Write ${runtime} code that does the following:\n${task}\n\n` +
      `Rules:\n` +
      `- Output results via ${language === 'python' ? 'print()' : 'console.log()'}\n` +
      `- Only use standard library (no npm/pip packages)\n` +
      `- No network requests, no file writes outside temp dir\n`;

    if (hasInputData) {
      prompt += `- Input data is available at ${readVar}. Read it with ${language === 'python' ? 'open(INPUT_DATA_PATH).read()' : 'require("fs").readFileSync(INPUT_DATA_PATH, "utf-8")'}\n`;
    }

    prompt += `\nReturn ONLY the code, no markdown fences, no explanation.`;

    if (previousAttempt) {
      prompt +=
        `\n\nPrevious attempt failed with this error:\n${previousAttempt.error.slice(0, 500)}\n` +
        `\nPrevious code:\n${previousAttempt.code.slice(0, 1000)}\n` +
        `\nFix the code and return ONLY the corrected version.`;
    }

    const { text } = await generateText({
      model: this.mistralProvider.getCodeModel(),
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 2000,
    });

    // Strip markdown fences if Devstral wrapped them
    const cleaned = text
      .replace(/^```(?:python|javascript|js|py)?\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    return cleaned || null;
  }
}

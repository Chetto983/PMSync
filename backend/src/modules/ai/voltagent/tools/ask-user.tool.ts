/**
 * Ask User Clarification Tool
 *
 * When the supervisor needs user input (choice between options, missing info),
 * it calls this tool. The tool result is emitted as a special event that the
 * frontend catches and displays as a modal dialog.
 *
 * This is more reliable than asking the LLM to output JSON blocks in text,
 * because Mistral handles tool calls with strict schema validation.
 *
 * @see https://sdk.vercel.ai/providers/ai-sdk-providers/mistral#model-capabilities
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { getToolTranslations, type SupportedLocale } from '../locales';

/**
 * Schema for ask-user options
 */
const AskUserOptionSchema = z.object({
  label: z.string().describe('Short option label (1-5 words)'),
  description: z.string().optional().describe('Optional explanation of what this option means'),
});

/**
 * Schema for ask-user tool parameters
 */
const AskUserParamsSchema = z.object({
  question: z.string().describe('The clear question to ask the user'),
  header: z.string().max(12).describe('Short label for the modal header (max 12 chars)'),
  options: z
    .array(AskUserOptionSchema)
    .min(1)
    .max(4)
    .describe('1-4 options for the user to choose from. First option should be recommended. User can always type custom answer.'),
  multiSelect: z.boolean().default(false).describe('Allow multiple selections (checkbox) vs single (radio)'),
});

export type AskUserParams = z.infer<typeof AskUserParamsSchema>;
export type AskUserOption = z.infer<typeof AskUserOptionSchema>;

/**
 * Creates the ask_user_clarification tool.
 *
 * Usage in supervisor prompt:
 * When you need user input, call ask_user_clarification with:
 * - question: What you're asking
 * - header: Short label
 * - options: Array of choices with label and optional description
 * - multiSelect: true if user can pick multiple
 */
export function createAskUserTool(params: { locale: SupportedLocale }) {
  const t = getToolTranslations(params.locale);

  // CRITICAL: This description MUST be compelling enough for Mistral to call the tool
  // instead of asking questions in plain text. Make it very explicit and forceful.
  const forcefulDescription = `MANDATORY tool for requesting user input. This is a BLOCKING call - execution PAUSES until user responds.

WHEN TO USE (required):
- Multiple contacts/emails/events match a search
- Missing required information (recipient, date, time)
- Ambiguous request that could mean different things
- Need user to choose between options

HOW IT WORKS:
1. You call this tool with question and options
2. Frontend displays interactive modal dialog
3. User clicks their choice
4. Execution resumes with user's selection

NEVER ask questions in plain text - ALWAYS use this tool for user input.`;

  return createTool({
    name: 'ask_user_clarification',
    description: t.askUser?.description || forcefulDescription,
    parameters: AskUserParamsSchema,
    execute: async (args: AskUserParams): Promise<{ __askUser: true } & AskUserParams> => {
      // The tool doesn't "execute" anything - it returns a marker object
      // that the stream transform will detect and emit as a special event.
      // The frontend then shows the modal and waits for user response.
      return {
        __askUser: true,
        question: args.question,
        header: args.header,
        options: args.options,
        multiSelect: args.multiSelect,
      };
    },
  });
}

/**
 * Type guard to check if a tool result is an ask-user request
 */
export function isAskUserResult(result: unknown): result is { __askUser: true } & AskUserParams {
  return (
    typeof result === 'object' &&
    result !== null &&
    '__askUser' in result &&
    (result as Record<string, unknown>).__askUser === true
  );
}

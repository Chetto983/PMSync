/**
 * parse-json-output.ts - Extract and validate JSON from LLM text responses.
 *
 * Qwen 3.5 via OpenRouter does not support AI SDK's Output.object() /
 * response_format: json_schema. This utility:
 * 1. Strips reasoning tokens and markdown fences from raw text
 * 2. Extracts the JSON object
 * 3. Validates against a Zod schema
 *
 * Replaces Output.object({ schema }) in generateText() calls.
 */
import { z } from 'zod';

/**
 * Extract the first JSON object from LLM text output.
 * Handles: markdown fences, reasoning prefix, trailing text.
 */
function extractJsonString(text: string): string | null {
  // 0. Strip thinking tokens (Qwen 3.5 Flash, DeepSeek, etc.)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Also handle unclosed <think> tags (model cut off mid-thought)
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '').trim();

  // 1. Try markdown code block first
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // 2. Find first { ... } or [ ... ] block
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');

  if (firstBrace === -1 && firstBracket === -1) return null;

  const startChar = firstBrace === -1 ? '[' :
    firstBracket === -1 ? '{' :
      firstBrace < firstBracket ? '{' : '[';
  const endChar = startChar === '{' ? '}' : ']';
  const startIdx = startChar === '{' ? firstBrace : firstBracket;

  // Walk forward counting braces to find the matching close
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === startChar) depth++;
    if (ch === endChar) depth--;
    if (depth === 0) return cleaned.slice(startIdx, i + 1);
  }

  // Fallback: return from first brace to end
  return cleaned.slice(startIdx);
}

/**
 * Parse JSON from LLM text and validate against Zod schema.
 *
 * @throws Error if no JSON found or validation fails
 */
export function parseJsonOutput<T extends z.ZodSchema>(
  text: string,
  schema: T,
): z.infer<T> {
  const jsonStr = extractJsonString(text);
  if (!jsonStr) {
    throw new Error(`No JSON found in LLM response (${text.length} chars)`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Invalid JSON in LLM response: ${(e as Error).message}`);
  }

  // Some models (e.g. Nemotron) wrap the object in an array — unwrap if needed
  if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'object' && raw[0] !== null) {
    raw = raw[0];
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = (result as { success: false; error: z.ZodError }).error.issues
      .map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Schema validation failed: ${issues}`);
  }

  return (result as { success: true; data: z.infer<T> }).data;
}

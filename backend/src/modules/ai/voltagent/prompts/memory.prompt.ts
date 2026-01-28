/**
 * Memory Extraction Prompts (RLM Pattern)
 *
 * LEAN VERSION - Reduced verbose prompts for faster LLM processing.
 * Each prompt is optimized for its specific task.
 */

/**
 * Fact Retrieval Prompt - Extracts facts from conversations
 * Reduced from ~1500 chars to ~600 chars
 */
export const FACT_RETRIEVAL_PROMPT = `Extract DURABLE user facts from conversation. Return JSON only.

REMEMBER:
- Preferences (communication style, email tone)
- Personal details (name, role, timezone)
- Professional info (job, company, projects)
- Patterns (work habits, availability)

SKIP:
- Actions taken ("sent email", "created event")
- Redacted content ([EMAIL_REDACTED], [CONTENT_REDACTED])
- One-time requests
- Transient info

Output format:
{"facts": ["Fact 1", "Fact 2"]}

No facts? Return: {"facts": []}`;

/**
 * Memory Deduction Prompt - Determines memory actions
 * Reduced from ~1200 chars to ~500 chars
 */
export const MEMORY_DEDUCTION_PROMPT = `Compare facts against existing memories. Determine action:

ADD: New durable info not in memory
UPDATE: Supersedes existing (include memory_id)
DELETE: Contradicts existing (include memory_id)
NONE: Already captured OR ephemeral/redacted content

ALWAYS NONE for:
- Actions (emails sent, events created)
- Redacted markers [EMAIL_REDACTED], etc.
- Transient requests

Output:
{"actions": [
  {"action": "ADD", "content": "..."},
  {"action": "UPDATE", "memory_id": "...", "content": "..."},
  {"action": "NONE", "content": "..."}
]}`;

/**
 * Memory Search Prompt - Finds relevant memories
 * Reduced from ~600 chars to ~300 chars
 */
export const MEMORY_SEARCH_PROMPT = `Rate memory relevance to query (0.0-1.0):
1.0: Directly answers query
0.7-0.9: Highly relevant
0.4-0.6: Somewhat useful
0.1-0.3: Tangential
0.0: Not relevant

Return memories with score >= 0.3, sorted by relevance:
{"relevant_memories": [
  {"memory_id": "...", "score": 0.95, "reason": "..."}
]}`;

/**
 * Memory Summary Prompt - Creates concise summaries
 * Reduced from ~500 chars to ~200 chars
 */
export const MEMORY_SUMMARY_PROMPT = `Summarize user memories (max 200 words):
- Group related info
- Prioritize recent/frequent
- Third person ("The user prefers...")
- Focus on actionable info

Output: {"summary": "..."}`;

/**
 * Infer memory type from content
 */
export function inferMemoryType(content: string): 'PREFERENCE' | 'FACT' | 'PATTERN' | 'INTERACTION' | 'CONTACT_NOTE' {
  const lower = content.toLowerCase();

  if (/prefer|like|dislike|want|style/.test(lower)) return 'PREFERENCE';
  if (/usually|always|often|habit|routine/.test(lower)) return 'PATTERN';
  if (/contact|colleague|client|boss|team/.test(lower)) return 'CONTACT_NOTE';
  if (/meeting|call|discussed|conversation/.test(lower)) return 'INTERACTION';

  return 'FACT';
}

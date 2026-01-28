/**
 * Memory Extraction Prompts (Based on mem0 patterns)
 *
 * Reference: https://github.com/mem0ai/mem0/blob/main/mem0/configs/prompts.py
 */

/**
 * Fact Retrieval Prompt - Extracts facts from conversations
 * Based on mem0's FACT_RETRIEVAL_PROMPT pattern
 */
export const FACT_RETRIEVAL_PROMPT = `You are a Personal Information Organizer for an email assistant. Extract relevant facts from conversations.

TYPES OF INFORMATION TO REMEMBER:
1. Contact details: names, emails, phone numbers, companies
2. Relationships: colleague, client, boss, friend, family
3. Preferences: email tone, communication style, language
4. Professional: job title, company, projects, responsibilities
5. Personal: timezone, location, important dates
6. Patterns: "usually checks emails in morning", "prefers brief replies"
7. Topics: recurring subjects, ongoing projects, key interests

EXAMPLES:
Input: "Send email to Marco at marco@acme.com"
Output: {"facts": ["Marco's email is marco@acme.com"]}

Input: "I prefer formal emails for clients"
Output: {"facts": ["User prefers formal tone for client emails"]}

Input: "Schedule meeting with my boss Giovanni tomorrow"
Output: {"facts": ["Giovanni is user's boss"]}

Input: "I work at TechCorp as a PM"
Output: {"facts": ["User works at TechCorp", "User's role is PM (Project Manager)"]}

Input: "riepiloga le mie email non lette"
Output: {"facts": []}

RULES:
- Extract from BOTH user and assistant messages
- Use same language as user
- Return {"facts": []} if no personal info found
- DO NOT extract generic actions like "searched emails"

Return JSON only: {"facts": ["fact1", "fact2"]}`;

/**
 * Memory Deduction Prompt - Determines memory actions
 * Based on mem0's UPDATE_MEMORY_PROMPT pattern
 */
export const MEMORY_DEDUCTION_PROMPT = `You are a smart memory manager. Compare new facts against existing memories.

OPERATIONS:
1. ADD: New information not present in existing memories
2. UPDATE: More recent or detailed info that supersedes existing (include memory_id)
3. DELETE: Information explicitly contradicted by new facts (include memory_id)
4. NONE: Information already exists in memory (skip)

EXAMPLES:

Example 1 - ADD new contact:
Existing: []
New fact: "Marco's email is marco@acme.com"
Result: {"action": "ADD", "content": "Marco's email is marco@acme.com"}

Example 2 - UPDATE existing:
Existing: [{"memory_id": "abc", "content": "User works at TechCorp"}]
New fact: "User now works at NewCorp"
Result: {"action": "UPDATE", "memory_id": "abc", "content": "User works at NewCorp"}

Example 3 - NONE (duplicate):
Existing: [{"memory_id": "xyz", "content": "Giovanni is user's boss"}]
New fact: "Giovanni is the boss"
Result: {"action": "NONE", "content": "Giovanni is user's boss"}

RULES:
- Prefer ADD when unsure
- Preserve memory_id for UPDATE/DELETE
- Return actions for ALL facts

Output JSON:
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
 * Infer memory type from content (based on mem0 categories)
 */
export function inferMemoryType(content: string): 'PREFERENCE' | 'FACT' | 'PATTERN' | 'INTERACTION' | 'CONTACT_NOTE' {
  const lower = content.toLowerCase();

  // Contact info: names + emails, relationships
  if (/@|email|colleague|client|boss|team|friend|family|contact|'s email|lavora|capo/.test(lower)) {
    return 'CONTACT_NOTE';
  }

  // Preferences: communication style, tone
  if (/prefer|like|dislike|want|style|tone|formal|casual|brief|detailed/.test(lower)) {
    return 'PREFERENCE';
  }

  // Patterns: behavioral, time-based
  if (/usually|always|often|habit|routine|morning|evening|daily|weekly/.test(lower)) {
    return 'PATTERN';
  }

  // Interactions: meetings, calls, discussions
  if (/meeting|call|discussed|conversation|scheduled|appuntamento/.test(lower)) {
    return 'INTERACTION';
  }

  // Default: general facts (job, company, location, etc.)
  return 'FACT';
}

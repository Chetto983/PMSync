/**
 * Memory Extraction Prompts - Adapted from mem0 (https://github.com/mem0ai/mem0)
 *
 * These prompts are used by the AI to extract and manage user memories.
 * @see https://docs.mem0.ai/overview
 */

/**
 * Fact Retrieval Prompt - Extracts facts from conversations
 *
 * Used to analyze user messages and extract structured facts
 * about preferences, personal details, work, etc.
 */
export const FACT_RETRIEVAL_PROMPT = `You are a Personal Information Organizer, specialized in accurately storing facts, user memories, and preferences. Your primary role is to extract relevant pieces of information from conversations and organize them into distinct, manageable facts. This allows for easy retrieval and personalization in future interactions. Below are the types of information you need to focus on and the detailed instructions on how to handle the input data.

Types of Information to Remember:
1. Store User Preferences: Keep track of likes, dislikes, and specific preferences in various categories such as communication style, email tone, work habits.
2. Maintain Important Personal Details: Remember significant personal information like names, relationships, important dates, and key life events.
3. Track Plans and Intentions: Note upcoming plans, goals, or intentions users mention.
4. Remember Activity and Service Preferences: Recall preferences for activities, travel, food, and other services.
5. Monitor Health and Wellness Preferences: Keep a record of health-related information and wellness preferences.
6. Store Professional Details: Remember details about users' professional lives like job titles, projects, colleagues.
7. Basic Facts: Remember basic facts about the user like their timezone, language, company, role.

⚠️ DO NOT REMEMBER:
- Ephemeral actions like "User sent an email to X" or "User created an event"
- Redacted content markers like [EMAIL_REDACTED], [CONTENT_REDACTED], [NAME_REDACTED]
- Specific email contents or subjects (these are stored elsewhere)
- One-time requests like "draft an email" or "schedule a meeting"
- System actions or confirmations
- Transient information that won't help in future conversations

Only store DURABLE facts that will be useful for personalizing FUTURE interactions.

Instructions:
1. Extract only the relevant, durable facts from the conversation.
2. Return the facts in a valid JSON format with a 'facts' key containing an array of fact strings.
3. Detect the language of the user input and record the facts in the same language.
4. Focus on extracting NEW information - things not already known.
5. Be concise - each fact should be a single, clear statement.
6. SKIP any facts about specific actions taken (emails sent, events created, etc.)
7. SKIP any facts containing redacted markers like [EMAIL_REDACTED] or [CONTENT_REDACTED]

Example output:
{
  "facts": [
    "User prefers brief email responses",
    "Works as CTO at Acme Corp",
    "Usually available from 9am-6pm UTC"
  ]
}

If no relevant facts are found, return:
{
  "facts": []
}

Return ONLY the JSON object, no additional text or explanation.`;

/**
 * Memory Deduction Prompt - Determines how to update memories
 *
 * Used to compare new facts against existing memories and decide:
 * - ADD: New information not in memory
 * - UPDATE: Information that supersedes existing memory
 * - DELETE: Information that contradicts existing memory
 * - NONE: Information already present, no action needed
 */
export const MEMORY_DEDUCTION_PROMPT = `You are a memory management AI that analyzes facts and determines the appropriate action for each.

Compare the retrieved facts against existing memories and determine the action:

- ADD: If the fact contains NEW, DURABLE information not present in any existing memory
- UPDATE: If the fact contains information that supersedes or is more recent than an existing memory (include the memory_id to update)
- DELETE: If the fact directly contradicts an existing memory making it invalid (include the memory_id to delete)
- NONE: If the fact is already captured in existing memories, OR if it's ephemeral/not useful

⚠️ ALWAYS return NONE for:
- Facts about specific actions (emails sent, events created, drafts made)
- Facts containing [EMAIL_REDACTED], [CONTENT_REDACTED], or similar placeholders
- Facts about one-time requests or transient activities
- Facts that won't help personalize future interactions

Rules:
1. Return a valid JSON array of actions
2. Each action has: action, content, and optionally memory_id (for UPDATE/DELETE)
3. Be conservative - only UPDATE or DELETE when clearly necessary
4. Only ADD durable facts that will be useful in future conversations
5. Return NONE for ephemeral or redacted content

Example output:
{
  "actions": [
    {"action": "ADD", "content": "User started new job at TechCo"},
    {"action": "UPDATE", "memory_id": "mem_123", "content": "User now prefers Slack over email"},
    {"action": "NONE", "content": "User sent an email to [EMAIL_REDACTED]"}
  ]
}

If no actions are needed, return:
{
  "actions": []
}

Return ONLY the JSON object, no additional text or explanation.`;

/**
 * Memory Search Prompt - Determines relevant memories for a query
 *
 * Used to find the most relevant memories for a given context or query.
 */
export const MEMORY_SEARCH_PROMPT = `You are a memory retrieval AI. Given a query and a list of user memories, determine which memories are most relevant.

Rate each memory's relevance from 0.0 to 1.0:
- 1.0: Directly answers or is essential to the query
- 0.7-0.9: Highly relevant context
- 0.4-0.6: Somewhat relevant, might be useful
- 0.1-0.3: Tangentially related
- 0.0: Not relevant

Return memories sorted by relevance, only including those with score >= 0.3.

Example output:
{
  "relevant_memories": [
    {"memory_id": "mem_123", "score": 0.95, "reason": "Directly answers query about email preferences"},
    {"memory_id": "mem_456", "score": 0.7, "reason": "Related context about communication style"}
  ]
}`;

/**
 * Memory Summary Prompt - Creates concise summaries
 *
 * Used to summarize multiple related memories into a coherent context.
 */
export const MEMORY_SUMMARY_PROMPT = `You are a memory summarization AI. Given a list of user memories, create a concise summary that captures the key information.

Guidelines:
1. Group related information together
2. Prioritize recent/frequently used memories
3. Keep the summary under 200 words
4. Write in third person (e.g., "The user prefers...")
5. Focus on actionable information

Return the summary as a JSON object:
{
  "summary": "The user is a CTO at Acme Corp who prefers brief, casual email communication. They work 9am-6pm UTC and are currently focused on Q1 planning."
}`;

/**
 * Extract memory type from content
 *
 * Simple heuristic to categorize a memory based on its content.
 */
export function inferMemoryType(content: string): 'PREFERENCE' | 'FACT' | 'PATTERN' | 'INTERACTION' | 'CONTACT_NOTE' {
  const lowerContent = content.toLowerCase();

  // Preference keywords
  if (
    lowerContent.includes('prefer') ||
    lowerContent.includes('like') ||
    lowerContent.includes('dislike') ||
    lowerContent.includes('want') ||
    lowerContent.includes('style')
  ) {
    return 'PREFERENCE';
  }

  // Pattern keywords
  if (
    lowerContent.includes('usually') ||
    lowerContent.includes('always') ||
    lowerContent.includes('often') ||
    lowerContent.includes('habit') ||
    lowerContent.includes('routine')
  ) {
    return 'PATTERN';
  }

  // Contact keywords
  if (
    lowerContent.includes('contact') ||
    lowerContent.includes('colleague') ||
    lowerContent.includes('client') ||
    lowerContent.includes('boss') ||
    lowerContent.includes('team')
  ) {
    return 'CONTACT_NOTE';
  }

  // Interaction keywords
  if (
    lowerContent.includes('meeting') ||
    lowerContent.includes('call') ||
    lowerContent.includes('discussed') ||
    lowerContent.includes('conversation')
  ) {
    return 'INTERACTION';
  }

  // Default to FACT
  return 'FACT';
}

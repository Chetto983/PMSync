/**
 * Inline skill content for the AI chat agent.
 *
 * Skills are contextual knowledge docs injected into the system prompt
 * based on classified intent. Stored inline (not as .md files) because
 * tsc doesn't copy non-TS assets to dist/.
 *
 * The .md files in this directory are the canonical source — keep them
 * in sync if you edit these strings.
 *
 * Phase SKILLS: Nanobot-inspired progressive context loading.
 */

export const SKILL_CONTENT: Record<string, string> = {
  'email-workflows': `# Email Workflows

## Search Strategy
- **Keyword search** (\`search_emails\`): Use when user mentions specific names, subjects, dates, or keywords. Fast, exact match.
- **Semantic search** (\`semantic_search\`): Use when user describes content vaguely ("that email about the deadline", "the conversation where we discussed pricing"). Slower but understands meaning.
- **Combined**: For ambiguous queries, try \`search_emails\` first. If no results or user seems unsatisfied, follow up with \`semantic_search\`.

## Compose & Reply Chain
1. **Always verify recipient**: Before composing, call \`search_contacts\` to confirm the email address. Never guess addresses.
2. **Draft vs Send**: Use \`draft_email\` unless user explicitly says "send", "invia", "manda". Drafts are safe; sends are irreversible.
3. **Reply flow**: \`search_emails\` → \`read_email\` (get context) → compose reply text → \`reply_email\`. Never reply without reading the original.
4. **Forward flow**: \`search_emails\` → \`read_email\` → \`search_contacts\` (get recipient) → \`forward_email\`.
5. **Tone matching**: When replying, match the formality of the original email. If the original is formal ("Dear Mr. Smith"), reply formally. If casual ("Hey!"), reply casually.

## Reading Emails
- If user says "show my emails" or "what's new" → use \`list_email_index\` (returns a browsable list with preview).
- If user says "read email from X" or "open the email about Y" → \`search_emails\` first to find it, then \`read_email\`.
- After showing a list, the user will often say "open #3" or "read the second one" — use the email ID from the list result.
- Always \`mark_email_read\` after showing full email content.

## Bulk Operations
- Before any bulk delete/archive: state the exact count and get confirmation via \`ask_user\`.
- Process in batches of 5-10, not all at once.
- Example: "I found 15 emails from newsletters. Should I archive all 15?"`,

  'triage-organization': `# Triage & Organization

## Inbox Triage Workflow
When user asks to triage, sort, or clean up inbox:

1. **Scan inbox**: \`list_email_index({ limit: 10, unreadOnly: true })\` to get recent unread emails.
2. **Assess each email** by examining sender, subject, and preview:
   - **Urgent/important**: \`star_email\` + \`label_email({ addLabels: ["urgent"] })\`
   - **Needs reply**: Note it for follow-up suggestion
   - **FYI/newsletter**: \`mark_email_read\` (no action needed)
   - **Spam/junk**: Flag for deletion
3. **Check follow-ups**: \`list_follow_ups({})\` to surface pending items.
4. **Summarize**: Present a clean summary:
   - "You have N unread emails. I starred M important ones. You have K pending follow-ups."
   - List the important ones with sender + subject
   - Offer specific next actions: "Want me to reply to any of these?"

## Labeling Strategy
- Use \`label_email\` with \`addLabels\` to tag emails.
- Common labels: "urgent", "important", "action-required", "waiting", "reference"
- To remove: use \`removeLabels\` parameter.
- After labeling, confirm: "I labeled the email from X as 'urgent'."

## Starring
- \`star_email({ starred: true })\` for important emails user wants to track.
- \`star_email({ starred: false })\` to unstar.
- Stars are visual markers — different from labels. Use stars for "needs attention now", labels for categorization.

## Read/Unread Management
- \`mark_email_read({ read: true })\` after user has seen the content.
- \`mark_email_read({ read: false })\` when user says "mark as unread" or "I'll read this later".

## Briefing / Status Check
When user asks "what's new", "briefing", "what did I miss":
1. \`list_email_index({ limit: 5, unreadOnly: true })\` — recent unread emails
2. \`list_follow_ups({})\` — pending follow-ups
3. \`view_calendar({ startDate: today, endDate: tomorrow })\` — today's events
4. Combine into a concise briefing with sections for each.`,

  'follow-up-management': `# Follow-Up Management

## What Are Follow-Ups
Follow-ups are auto-detected action items from emails — deadlines, pending responses, tasks. The system creates them automatically via triage. Users manage them through the chat agent.

## Listing Follow-Ups
- \`list_follow_ups({})\` — shows PENDING + REMINDED by default (active items).
- \`list_follow_ups({ status: "RESOLVED" })\` — show completed ones.
- \`list_follow_ups({ status: "EXPIRED" })\` — show expired ones.
- Always present follow-ups with: subject, sender, due date, status, reason.
- Sort by urgency: overdue first, then due today, then upcoming.

## Actions
- **Resolve**: \`update_follow_up({ followUpId, action: "resolve" })\` — marks as done. Use when user says "done", "completed", "mark as finished", "risolvi".
- **Snooze**: \`update_follow_up({ followUpId, action: "snooze", snoozeDays: N })\` — pushes due date forward N days. Default 3 days. Use when user says "remind me later", "snooze", "rimanda", "posticipa".
- **Reopen**: \`update_follow_up({ followUpId, action: "reopen" })\` — sets back to PENDING. Use when user says "reopen", "not done yet", "riapri".

## Handling Ambiguity
- If user says "resolve the follow-up" without specifying which one → first \`list_follow_ups({})\`, then \`ask_user\` with the list: "Which follow-up should I resolve? 1) Email from Marco about budget (due tomorrow) 2) Invoice from supplier (overdue)"
- If user references an email subject → \`list_follow_ups({})\`, match by subject, then act.
- Never guess the followUpId. Always list first if you don't have it.

## Proactive Suggestions
When showing follow-ups, offer actions:
- Overdue: "This follow-up is overdue. Want me to resolve it or snooze for 3 days?"
- Due today: "This is due today. Want me to help you take action?"
- After resolving: "Follow-up resolved. You have N remaining."

## Connection to Emails
Each follow-up links to an email. If user wants context:
1. Get the emailId from the follow-up result
2. \`read_email({ emailId })\` to show the original email
3. Offer to reply or forward based on the follow-up type`,
};

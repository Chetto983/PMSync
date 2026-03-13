# Triage & Organization

## Inbox Triage Workflow
When user asks to triage, sort, or clean up inbox:

1. **Scan inbox**: `list_email_index({ limit: 10, unreadOnly: true })` to get recent unread emails.
2. **Assess each email** by examining sender, subject, and preview:
   - **Urgent/important**: `star_email` + `label_email({ addLabels: ["urgent"] })`
   - **Needs reply**: Note it for follow-up suggestion
   - **FYI/newsletter**: `mark_email_read` (no action needed)
   - **Spam/junk**: Flag for deletion
3. **Check follow-ups**: `list_follow_ups({})` to surface pending items.
4. **Summarize**: Present a clean summary:
   - "You have N unread emails. I starred M important ones. You have K pending follow-ups."
   - List the important ones with sender + subject
   - Offer specific next actions: "Want me to reply to any of these?"

## Labeling Strategy
- Use `label_email` with `addLabels` to tag emails.
- Common labels: "urgent", "important", "action-required", "waiting", "reference"
- To remove: use `removeLabels` parameter.
- After labeling, confirm: "I labeled the email from X as 'urgent'."

## Starring
- `star_email({ starred: true })` for important emails user wants to track.
- `star_email({ starred: false })` to unstar.
- Stars are visual markers — different from labels. Use stars for "needs attention now", labels for categorization.

## Read/Unread Management
- `mark_email_read({ read: true })` after user has seen the content.
- `mark_email_read({ read: false })` when user says "mark as unread" or "I'll read this later".

## Briefing / Status Check
When user asks "what's new", "briefing", "what did I miss":
1. `list_email_index({ limit: 5, unreadOnly: true })` — recent unread emails
2. `list_follow_ups({})` — pending follow-ups
3. `view_calendar({ startDate: today, endDate: tomorrow })` — today's events
4. Combine into a concise briefing with sections for each.

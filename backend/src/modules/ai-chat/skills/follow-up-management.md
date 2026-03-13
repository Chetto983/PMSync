# Follow-Up Management

## What Are Follow-Ups
Follow-ups are auto-detected action items from emails — deadlines, pending responses, tasks. The system creates them automatically via triage. Users manage them through the chat agent.

## Listing Follow-Ups
- `list_follow_ups({})` — shows PENDING + REMINDED by default (active items).
- `list_follow_ups({ status: "RESOLVED" })` — show completed ones.
- `list_follow_ups({ status: "EXPIRED" })` — show expired ones.
- Always present follow-ups with: subject, sender, due date, status, reason.
- Sort by urgency: overdue first, then due today, then upcoming.

## Actions
- **Resolve**: `update_follow_up({ followUpId, action: "resolve" })` — marks as done. Use when user says "done", "completed", "mark as finished", "risolvi".
- **Snooze**: `update_follow_up({ followUpId, action: "snooze", snoozeDays: N })` — pushes due date forward N days. Default 3 days. Use when user says "remind me later", "snooze", "rimanda", "posticipa".
- **Reopen**: `update_follow_up({ followUpId, action: "reopen" })` — sets back to PENDING. Use when user says "reopen", "not done yet", "riapri".

## Handling Ambiguity
- If user says "resolve the follow-up" without specifying which one → first `list_follow_ups({})`, then `ask_user` with the list: "Which follow-up should I resolve? 1) Email from Marco about budget (due tomorrow) 2) Invoice from supplier (overdue)"
- If user references an email subject → `list_follow_ups({})`, match by subject, then act.
- Never guess the followUpId. Always list first if you don't have it.

## Proactive Suggestions
When showing follow-ups, offer actions:
- Overdue: "This follow-up is overdue. Want me to resolve it or snooze for 3 days?"
- Due today: "This is due today. Want me to help you take action?"
- After resolving: "Follow-up resolved. You have N remaining."

## Connection to Emails
Each follow-up links to an email. If user wants context:
1. Get the emailId from the follow-up result
2. `read_email({ emailId })` to show the original email
3. Offer to reply or forward based on the follow-up type

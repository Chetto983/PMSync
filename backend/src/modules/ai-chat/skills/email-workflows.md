# Email Workflows

## Search Strategy
- **Keyword search** (`search_emails`): Use when user mentions specific names, subjects, dates, or keywords. Fast, exact match.
- **Semantic search** (`semantic_search`): Use when user describes content vaguely ("that email about the deadline", "the conversation where we discussed pricing"). Slower but understands meaning.
- **Combined**: For ambiguous queries, try `search_emails` first. If no results or user seems unsatisfied, follow up with `semantic_search`.

## Compose & Reply Chain
1. **Always verify recipient**: Before composing, call `search_contacts` to confirm the email address. Never guess addresses.
2. **Draft vs Send**: Use `draft_email` unless user explicitly says "send", "invia", "manda". Drafts are safe; sends are irreversible.
3. **Reply flow**: `search_emails` → `read_email` (get context) → compose reply text → `reply_email`. Never reply without reading the original.
4. **Forward flow**: `search_emails` → `read_email` → `search_contacts` (get recipient) → `forward_email`.
5. **Tone matching**: When replying, match the formality of the original email. If the original is formal ("Dear Mr. Smith"), reply formally. If casual ("Hey!"), reply casually.

## Reading Emails
- If user says "show my emails" or "what's new" → use `list_email_index` (returns a browsable list with preview).
- If user says "read email from X" or "open the email about Y" → `search_emails` first to find it, then `read_email`.
- After showing a list, the user will often say "open #3" or "read the second one" — use the email ID from the list result.
- Always `mark_email_read` after showing full email content.

## Bulk Operations
- Before any bulk delete/archive: state the exact count and get confirmation via `ask_user`.
- Process in batches of 5-10, not all at once.
- Example: "I found 15 emails from newsletters. Should I archive all 15?"

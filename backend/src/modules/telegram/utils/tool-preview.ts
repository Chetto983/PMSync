/**
 * Tool-specific preview formatters for Telegram HITL approval cards.
 *
 * Each formatter produces Markdown lines summarizing the action
 * the AI wants to perform, so the user can make an informed decision.
 */

/**
 * Escape Telegram Markdown v1 special characters in user-provided values.
 * Characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * We only escape the 4 that Markdown v1 actually uses: _ * ` [
 */
function esc(value: unknown): string {
  return String(value ?? '').replace(/([_*`\[])/g, '\\$1');
}

type ToolFormatter = (input: Record<string, unknown>) => string[];

const emailFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.to) lines.push(`*To:* ${esc(input.to)}`);
  if (input.cc) lines.push(`*CC:* ${esc(input.cc)}`);
  if (input.subject) lines.push(`*Subject:* ${esc(input.subject)}`);
  if (input.body) {
    const body = String(input.body);
    const truncated = body.length > 150 ? body.slice(0, 150) + '...' : body;
    lines.push(`*Body:* ${esc(truncated)}`);
  }
  if (input.emailId) lines.push(`*Email ID:* ${esc(String(input.emailId).slice(0, 20))}...`);
  return lines;
};

const deleteEmailFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.emailId) lines.push(`*Email ID:* ${esc(input.emailId)}`);
  if (input.subject) lines.push(`*Subject:* ${esc(input.subject)}`);
  lines.push('_This action is irreversible._');
  return lines;
};

const contactFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.name) lines.push(`*Name:* ${esc(input.name)}`);
  if (input.email) lines.push(`*Email:* ${esc(input.email)}`);
  if (input.contactId) lines.push(`*Contact ID:* ${esc(String(input.contactId).slice(0, 20))}...`);
  return lines;
};

const eventFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.title) lines.push(`*Title:* ${esc(input.title)}`);
  if (input.start) lines.push(`*Start:* ${esc(input.start)}`);
  if (input.end) lines.push(`*End:* ${esc(input.end)}`);
  if (input.eventId) lines.push(`*Event ID:* ${esc(String(input.eventId).slice(0, 20))}...`);
  return lines;
};

const genericFormatter: ToolFormatter = (input) => {
  return Object.entries(input)
    .slice(0, 5)
    .map(([key, value]) => {
      const val = typeof value === 'string'
        ? value.length > 150 ? value.slice(0, 150) + '...' : value
        : JSON.stringify(value)?.slice(0, 150) ?? '';
      return `*${esc(key)}:* ${esc(val)}`;
    });
};

const FORMATTERS: Record<string, ToolFormatter> = {
  send_email: emailFormatter,
  reply_email: emailFormatter,
  forward_email: emailFormatter,
  draft_email: emailFormatter,
  delete_email: deleteEmailFormatter,
  archive_email: deleteEmailFormatter,
  create_contact: contactFormatter,
  update_contact: contactFormatter,
  delete_contact: contactFormatter,
  create_event: eventFormatter,
  update_event: eventFormatter,
  delete_event: eventFormatter,
};

/**
 * Format tool input for a Telegram approval card.
 * Returns Markdown lines describing the action parameters.
 */
export function formatToolPreview(
  toolName: string,
  input: Record<string, unknown>,
): string[] {
  const formatter = FORMATTERS[toolName] ?? genericFormatter;
  return formatter(input);
}

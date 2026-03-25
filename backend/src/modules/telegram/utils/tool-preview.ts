/**
 * Tool-specific preview formatters for Telegram HITL approval cards.
 *
 * Each formatter produces Markdown lines summarizing the action
 * the AI wants to perform, so the user can make an informed decision.
 */

type ToolFormatter = (input: Record<string, unknown>) => string[];

const emailFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.to) lines.push(`*A:* ${input.to}`);
  if (input.cc) lines.push(`*CC:* ${input.cc}`);
  if (input.subject) lines.push(`*Oggetto:* ${input.subject}`);
  if (input.body) {
    const body = String(input.body);
    lines.push(`*Corpo:* ${body.length > 150 ? body.slice(0, 150) + '...' : body}`);
  }
  if (input.emailId) lines.push(`*Email ID:* ${String(input.emailId).slice(0, 20)}...`);
  return lines;
};

const deleteEmailFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.emailId) lines.push(`*Email ID:* ${input.emailId}`);
  if (input.subject) lines.push(`*Oggetto:* ${input.subject}`);
  lines.push('_Questa azione è irreversibile._');
  return lines;
};

const contactFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.name) lines.push(`*Nome:* ${input.name}`);
  if (input.email) lines.push(`*Email:* ${input.email}`);
  if (input.contactId) lines.push(`*Contatto ID:* ${String(input.contactId).slice(0, 20)}...`);
  return lines;
};

const eventFormatter: ToolFormatter = (input) => {
  const lines: string[] = [];
  if (input.title) lines.push(`*Titolo:* ${input.title}`);
  if (input.start) lines.push(`*Inizio:* ${input.start}`);
  if (input.end) lines.push(`*Fine:* ${input.end}`);
  if (input.eventId) lines.push(`*Evento ID:* ${String(input.eventId).slice(0, 20)}...`);
  return lines;
};

const genericFormatter: ToolFormatter = (input) => {
  return Object.entries(input)
    .slice(0, 5)
    .map(([key, value]) => {
      const val = typeof value === 'string'
        ? value.length > 150 ? value.slice(0, 150) + '...' : value
        : JSON.stringify(value)?.slice(0, 150) ?? '';
      return `*${key}:* ${val}`;
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

/**
 * Tool domain mapping for prepareStep activeTools routing.
 *
 * After step 0, only tools from active domains (+ utility + knowledge) are exposed.
 * This reduces context window usage and improves model tool selection accuracy.
 */

export const TOOL_DOMAINS: Record<string, string> = {
  // Email domain
  send_email: 'email',
  search_emails: 'email',
  read_email: 'email',
  archive_email: 'email',
  move_email: 'email',
  delete_email: 'email',
  forward_email: 'email',
  reply_email: 'email',
  draft_email: 'email',
  list_email_index: 'email',
  star_email: 'email',
  mark_email_read: 'email',
  label_email: 'email',
  // Calendar domain
  view_calendar: 'calendar',
  create_event: 'calendar',
  update_event: 'calendar',
  delete_event: 'calendar',
  // Contacts domain
  search_contacts: 'contacts',
  create_contact: 'contacts',
  update_contact: 'contacts',
  delete_contact: 'contacts',
  // Folders domain
  list_folders: 'folders',
  create_folder: 'folders',
  rename_folder: 'folders',
  delete_folder: 'folders',
  // Knowledge / memory domain (always active after step 0)
  semantic_search: 'knowledge',
  graph_context_search: 'knowledge',
  save_memory: 'knowledge',
  list_memories: 'knowledge',
  delete_memory: 'knowledge',
  // Productivity domain
  list_follow_ups: 'productivity',
  update_follow_up: 'productivity',
  list_reminders: 'productivity',
  create_reminder: 'productivity',
  update_reminder: 'productivity',
  delete_reminder: 'productivity',
  // Utility domain (always active after step 0)
  run_code: 'utility',
  ask_user: 'utility',
};

export function getToolDomain(toolName: string): string | undefined {
  return TOOL_DOMAINS[toolName];
}

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
  complete_reminder: 'productivity',
  snooze_reminder: 'productivity',
  // CRM domain (deal tools + intelligence tools)
  get_deals_by_pipeline: 'crm',
  move_deal_stage: 'crm',
  get_deal_timeline: 'crm',
  get_next_best_action: 'crm',
  get_lead_score: 'crm',
  list_top_leads: 'crm',
  get_revenue_forecast: 'crm',
  get_churn_risk: 'crm',
  list_churn_at_risk: 'crm',
  get_ai_costs: 'crm',
  get_model_performance: 'crm',
  // Utility domain (always active after step 0)
  run_code: 'utility',
  code_assistant: 'utility',
  ask_user: 'utility',
};

export function getToolDomain(toolName: string): string | undefined {
  return TOOL_DOMAINS[toolName];
}

/**
 * Barrel export for chat tool UI renderers.
 * TOOL_RENDERERS maps tool names to lazy-loaded renderer components.
 * FallbackToolRenderer handles unregistered tools and HITL approval cards.
 */
import { lazy } from 'react';

// Lazy-load tool renderers — only the renderer(s) actually used get loaded
const EmailSearchRenderer = lazy(() => import('./EmailSearchToolUI').then(m => ({ default: m.EmailSearchRenderer })));
const ListEmailsRenderer = lazy(() => import('./EmailSearchToolUI').then(m => ({ default: m.ListEmailsRenderer })));
const SemanticSearchRenderer = lazy(() => import('./EmailSearchToolUI').then(m => ({ default: m.SemanticSearchRenderer })));
const EmailListRenderer = lazy(() => import('./EmailListToolUI').then(m => ({ default: m.EmailListRenderer })));
const EmailContentRenderer = lazy(() => import('./EmailContentToolUI').then(m => ({ default: m.EmailContentRenderer })));
const FollowUpRenderer = lazy(() => import('./FollowUpToolUI').then(m => ({ default: m.FollowUpRenderer })));
const ContactRenderer = lazy(() => import('./ContactToolUI').then(m => ({ default: m.ContactRenderer })));
const EventRenderer = lazy(() => import('./EventToolUI').then(m => ({ default: m.EventRenderer })));
const CountRenderer = lazy(() => import('./CountToolUI').then(m => ({ default: m.CountRenderer })));
const FolderRenderer = lazy(() => import('./FolderToolUI').then(m => ({ default: m.FolderRenderer })));
const AnalysisRenderer = lazy(() => import('./AnalysisToolUI').then(m => ({ default: m.AnalysisRenderer })));
const MemoryRenderer = lazy(() => import('./MemoryToolUI').then(m => ({ default: m.MemoryRenderer })));
const MemorySearchRenderer = lazy(() => import('./MemoryToolUI').then(m => ({ default: m.MemorySearchRenderer })));
const BriefingRenderer = lazy(() => import('./BriefingToolUI').then(m => ({ default: m.BriefingRenderer })));
const CrmRenderer = lazy(() => import('./CrmToolUI').then(m => ({ default: m.CrmRenderer })));
const DraftEmailRenderer = lazy(() => import('./DraftEmailToolUI').then(m => ({ default: m.DraftEmailRenderer })));
const AskUserRenderer = lazy(() => import('./ConversationToolUI').then(m => ({ default: m.AskUserRenderer })));
const SaveMemoryRenderer = lazy(() => import('./ConversationToolUI').then(m => ({ default: m.SaveMemoryRenderer })));
const CreateReminderRenderer = lazy(() => import('./ReminderToolUI').then(m => ({ default: m.CreateReminderRenderer })));
const ListRemindersRenderer = lazy(() => import('./ReminderToolUI').then(m => ({ default: m.ListRemindersRenderer })));
// Sprint 14.1: CRM deal + intelligence + governance renderers
const DealListRenderer = lazy(() => import('./DealsToolUI').then(m => ({ default: m.DealListRenderer })));
const DealMoveRenderer = lazy(() => import('./DealsToolUI').then(m => ({ default: m.DealMoveRenderer })));
const DealTimelineRenderer = lazy(() => import('./DealsToolUI').then(m => ({ default: m.DealTimelineRenderer })));
const LeadScoreRenderer = lazy(() => import('./CrmIntelligenceToolUI').then(m => ({ default: m.LeadScoreRenderer })));
const TopLeadsRenderer = lazy(() => import('./CrmIntelligenceToolUI').then(m => ({ default: m.TopLeadsRenderer })));
const ChurnRiskRenderer = lazy(() => import('./CrmIntelligenceToolUI').then(m => ({ default: m.ChurnRiskRenderer })));
const ChurnAtRiskRenderer = lazy(() => import('./CrmIntelligenceToolUI').then(m => ({ default: m.ChurnAtRiskRenderer })));
const ForecastRenderer = lazy(() => import('./CrmIntelligenceToolUI').then(m => ({ default: m.ForecastRenderer })));
const AiCostsRenderer = lazy(() => import('./GovernanceToolUI').then(m => ({ default: m.AiCostsRenderer })));
const ModelPerformanceRenderer = lazy(() => import('./GovernanceToolUI').then(m => ({ default: m.ModelPerformanceRenderer })));

export { FallbackToolRenderer } from './FallbackToolUI';

export const TOOL_RENDERERS = {
  search_emails: EmailSearchRenderer,
  list_emails: ListEmailsRenderer,
  semantic_search_emails: SemanticSearchRenderer,
  list_email_index: EmailListRenderer,
  get_email_content: EmailContentRenderer,
  list_follow_ups: FollowUpRenderer,
  search_contacts: ContactRenderer,
  get_events: EventRenderer,
  count_emails: CountRenderer,
  list_folders: FolderRenderer,
  analyze_email: AnalysisRenderer,
  search_memory: MemoryRenderer,
  memory_search: MemorySearchRenderer,
  get_daily_briefing: BriefingRenderer,
  get_relationship_stats: CrmRenderer,
  draft_email: DraftEmailRenderer,
  ask_user: AskUserRenderer,
  save_memory: SaveMemoryRenderer,
  create_reminder: CreateReminderRenderer,
  list_reminders: ListRemindersRenderer,
  // Sprint 14.1: CRM deal + intelligence + governance
  get_deals_by_pipeline: DealListRenderer,
  move_deal_stage: DealMoveRenderer,
  get_deal_timeline: DealTimelineRenderer,
  get_lead_score: LeadScoreRenderer,
  list_top_leads: TopLeadsRenderer,
  get_churn_risk: ChurnRiskRenderer,
  list_churn_at_risk: ChurnAtRiskRenderer,
  get_revenue_forecast: ForecastRenderer,
  get_ai_costs: AiCostsRenderer,
  get_model_performance: ModelPerformanceRenderer,
} as const;

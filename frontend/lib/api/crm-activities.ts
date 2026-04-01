/**
 * CRM Activities API module
 *
 * Backend: CrmModule > ContextController
 * Endpoints: /api/v1/crm/activities
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface TimelineActivity {
  id: string;
  type: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TimelineResponse {
  data: TimelineActivity[];
  nextCursor: string | null;
}

export type ActivityEntityType = 'account' | 'deal';

// ---- API ----

export const crmActivitiesApi = {
  getTimeline(entityType: ActivityEntityType, entityId: string, params?: { cursor?: string; limit?: number }) {
    return apiClient.get<TimelineResponse>(`/crm/activities/${entityType}/${entityId}`, { params });
  },
};

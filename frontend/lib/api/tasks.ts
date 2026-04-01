/**
 * Tasks API module
 *
 * Backend: TasksModule > TasksController
 * Endpoints: /api/v1/tasks
 */
import { apiClient } from '../api-client';

// ---- Types ----

export type TaskSourceType = 'follow_up' | 'reminder' | 'deal_action' | 'ticket' | 'manual';
export type UnifiedTaskStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed' | 'expired';
export type UnifiedTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface UnifiedTask {
  id: string;
  sourceType: TaskSourceType;
  sourceId: string;
  title: string;
  description: string | null;
  status: UnifiedTaskStatus;
  priority: UnifiedTaskPriority;
  dueDate: string | null;
  contactName: string | null;
  contactId: string | null;
  dealId: string | null;
  emailId: string | null;
  ticketId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export type TaskCounts = Record<TaskSourceType, number>;

export interface TaskMeta {
  total: number;
  page: number;
  limit: number;
  counts: TaskCounts;
}

export interface UnifiedTaskListResponse {
  data: UnifiedTask[];
  meta: TaskMeta;
}

export interface ListTasksQuery {
  sourceType?: TaskSourceType[];
  status?: UnifiedTaskStatus[];
  priority?: UnifiedTaskPriority[];
  dueBefore?: string;
  dueAfter?: string;
  contactId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'dueDate' | 'createdAt' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateManualTaskDto {
  title: string;
  description?: string;
  priority?: UnifiedTaskPriority;
  dueDate?: string;
  contactId?: string;
  dealId?: string;
  emailId?: string;
}

export interface UpdateManualTaskDto extends Partial<CreateManualTaskDto> {
  status?: UnifiedTaskStatus;
}

// ---- API ----

export const tasksApi = {
  list(query?: ListTasksQuery) {
    return apiClient.get<UnifiedTaskListResponse>('/tasks', { params: query });
  },

  create(dto: CreateManualTaskDto) {
    return apiClient.post<{ data: UnifiedTask }>('/tasks', dto);
  },

  update(sourceType: TaskSourceType, id: string, dto: UpdateManualTaskDto) {
    return apiClient.patch<{ data: UnifiedTask }>(`/tasks/${sourceType}/${id}`, dto);
  },

  delete(sourceType: TaskSourceType, id: string) {
    return apiClient.delete<{ success: boolean }>(`/tasks/${sourceType}/${id}`);
  },

  complete(sourceType: TaskSourceType, id: string) {
    return apiClient.post<{ success: boolean }>(`/tasks/${sourceType}/${id}/complete`);
  },
};

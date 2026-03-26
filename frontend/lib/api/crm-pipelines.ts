/**
 * CRM Pipelines API module
 *
 * Backend: CrmModule > PipelineController + StageController
 * Endpoints: /api/v1/crm/pipelines, /api/v1/crm/stages
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface StageAutomationRule {
  type: 'NOTIFY' | 'CREATE_TASK';
  enabled: boolean;
  params: {
    message?: string;
    taskTitle?: string;
    taskDescription?: string;
  };
}

export interface CrmStage {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  probability: number;
  color: string | null;
  isWon: boolean;
  isLost: boolean;
  automations: StageAutomationRule[] | null;
  createdAt: string;
  updatedAt: string;
  _count?: { deals: number };
}

export interface CrmPipeline {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  stages?: CrmStage[];
  _count?: { stages: number; deals: number };
}

export interface CreatePipelineDto {
  name: string;
  description?: string;
  isDefault?: boolean;
}

export interface UpdatePipelineDto {
  name?: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CreateStageDto {
  name: string;
  probability?: number;
  color?: string;
  isWon?: boolean;
  isLost?: boolean;
}

export interface UpdateStageDto {
  name?: string;
  probability?: number;
  color?: string;
  isWon?: boolean;
  isLost?: boolean;
  automations?: StageAutomationRule[];
}

// ---- Metrics Types ----

export interface StageMetric {
  stageId: string;
  stageName: string;
  stageColor: string | null;
  dealCount: number;
  totalValue: number;
  avgDaysInStage: number;
}

export interface PipelineMetrics {
  pipelineId: string;
  conversionRate: number;
  avgDealVelocity: number;
  winRate: number;
  totalValue: number;
  weightedValue: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  stageMetrics: StageMetric[];
}

// ---- Saved View Types ----

export interface CrmSavedView {
  id: string;
  tenantId: string;
  pipelineId: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedViewDto {
  name: string;
  filters: Record<string, unknown>;
}

export interface UpdateSavedViewDto {
  name?: string;
  filters?: Record<string, unknown>;
}

// ---- API ----

export const crmPipelinesApi = {
  list() {
    return apiClient.get<CrmPipeline[]>('/crm/pipelines');
  },

  getById(id: string) {
    return apiClient.get<CrmPipeline>(`/crm/pipelines/${id}`);
  },

  create(dto: CreatePipelineDto) {
    return apiClient.post<CrmPipeline>('/crm/pipelines', dto);
  },

  update(id: string, dto: UpdatePipelineDto) {
    return apiClient.patch<CrmPipeline>(`/crm/pipelines/${id}`, dto);
  },

  delete(id: string) {
    return apiClient.delete<{ deleted: boolean }>(`/crm/pipelines/${id}`);
  },

  // Stage operations
  createStage(pipelineId: string, dto: CreateStageDto) {
    return apiClient.post<CrmStage>(`/crm/pipelines/${pipelineId}/stages`, dto);
  },

  updateStage(stageId: string, dto: UpdateStageDto) {
    return apiClient.patch<CrmStage>(`/crm/stages/${stageId}`, dto);
  },

  deleteStage(stageId: string) {
    return apiClient.delete<{ deleted: boolean }>(`/crm/stages/${stageId}`);
  },

  reorderStages(pipelineId: string, orderedIds: string[]) {
    return apiClient.patch<CrmStage[]>(
      `/crm/pipelines/${pipelineId}/stages/reorder`,
      { orderedIds },
    );
  },

  // Metrics
  getMetrics(pipelineId: string) {
    return apiClient.get<PipelineMetrics>(`/crm/pipelines/${pipelineId}/metrics`);
  },

  // Saved Views
  listViews(pipelineId: string) {
    return apiClient.get<CrmSavedView[]>(`/crm/pipelines/${pipelineId}/views`);
  },

  createView(pipelineId: string, dto: CreateSavedViewDto) {
    return apiClient.post<CrmSavedView>(`/crm/pipelines/${pipelineId}/views`, dto);
  },

  updateView(viewId: string, dto: UpdateSavedViewDto) {
    return apiClient.patch<CrmSavedView>(`/crm/pipelines/views/${viewId}`, dto);
  },

  deleteView(viewId: string) {
    return apiClient.delete<{ deleted: boolean }>(`/crm/pipelines/views/${viewId}`);
  },
};

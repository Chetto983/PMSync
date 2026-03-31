/**
 * CRM Service Analytics API module
 *
 * Backend: CrmModule > AnalyticsController
 * Endpoints: /api/v1/crm/analytics
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface CsatAggregation {
  averageRating: number | null;
  totalResponses: number;
  distribution: Record<number, number>;
  monthlyTrend: Array<{ month: string; avg: number; count: number }>;
}

export interface ServiceMetrics {
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  slaComplianceRate: number | null;
  csatAverage: number | null;
  topTicketsByResolution: Array<{
    id: string;
    subject: string;
    resolutionMinutes: number;
    assigneeName: string | null;
  }>;
}

// ---- API Functions ----

export async function getCsatAggregation(params?: {
  startDate?: string;
  endDate?: string;
  assigneeId?: string;
}): Promise<CsatAggregation> {
  const { data } = await apiClient.get('/crm/analytics/csat', { params });
  return data;
}

export async function getServiceMetrics(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<ServiceMetrics> {
  const { data } = await apiClient.get('/crm/analytics/service', { params });
  return data;
}

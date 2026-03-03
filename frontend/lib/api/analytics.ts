import { apiClient } from '../api-client';

// ===== TYPES =====

export interface EmailAnalyticsDataPoint {
  name: string;
  emails: number;
  sent: number;
  received: number;
}

export interface EmailAnalyticsResponse {
  data: EmailAnalyticsDataPoint[];
}

export interface EmailStatsResponse {
  total: number;
  unread: number;
  sent: number;
  received: number;
  drafts: number;
  starred: number;
  archived: number;
  byFolder: Record<string, number>;
  byProvider?: Record<string, number>;
}

export interface ActivityTimelineItem {
  timestamp: string;
  type: 'sent' | 'received' | 'draft' | 'starred' | 'archived';
  count: number;
}

export interface ActivityTimelineResponse {
  timeline: ActivityTimelineItem[];
  period: string;
}

// ===== API CLIENT =====

export const analyticsApi = {
  /**
   * Get email analytics with historical data
   * GET /api/v1/ai/analytics/email
   */
  async getEmailAnalytics(): Promise<EmailAnalyticsDataPoint[]> {
    const response = await apiClient.get('/ai/analytics/email');
    // Backend returns { success, analytics } - extract the data array
    const analytics = response.data?.analytics;
    if (analytics?.volumeTrends) {
      return analytics.volumeTrends;
    }
    return response.data || [];
  },

  /**
   * Get email statistics
   * This uses the email API stats endpoint for now
   */
  async getEmailStats(providerId?: string): Promise<EmailStatsResponse> {
    const query = providerId ? `?providerId=${providerId}` : '';
    const response = await apiClient.get(`/emails/stats${query}`);
    return response.data;
  },

  // Placeholder for future analytics endpoints
  // These can be implemented when the backend adds more analytics features

  /**
   * Get activity timeline (future enhancement)
   */
  // async getActivityTimeline(params?: {
  //   startDate?: string;
  //   endDate?: string;
  //   providerId?: string;
  // }): Promise<ActivityTimelineResponse> {
  //   const response = await apiClient.get('/analytics/activity', { params });
  //   return response.data;
  // },

  /**
   * Get top senders/recipients (future enhancement)
   */
  // async getTopContacts(params?: {
  //   type: 'senders' | 'recipients';
  //   limit?: number;
  //   startDate?: string;
  //   endDate?: string;
  // }): Promise<{ contacts: Array<{ email: string; count: number }> }> {
  //   const response = await apiClient.get('/analytics/contacts', { params });
  //   return response.data;
  // },
};

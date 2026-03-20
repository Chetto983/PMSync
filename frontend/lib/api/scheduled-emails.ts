/**
 * Scheduled Emails API Client
 *
 * Endpoints:
 * - GET /emails/scheduled - list all
 * - DELETE /emails/scheduled/:id - cancel
 * - PATCH /emails/scheduled/:id - reschedule
 */
import { apiClient } from '../api-client';

export interface ScheduledEmail {
  id: string;
  to: string[];
  subject: string;
  scheduledAt: string;
  status: string;
  errorMessage?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export const scheduledEmailsApi = {
  /**
   * List all scheduled emails for the current tenant
   */
  list() {
    return apiClient.get<ScheduledEmail[]>('/emails/scheduled');
  },

  /**
   * Cancel a pending scheduled email
   */
  cancel(id: string) {
    return apiClient.delete<{ success: boolean; message: string }>(`/emails/scheduled/${id}`);
  },

  /**
   * Reschedule a pending email to a new time
   */
  reschedule(id: string, scheduledAt: string) {
    return apiClient.patch<ScheduledEmail>(`/emails/scheduled/${id}`, { scheduledAt });
  },
};

export default scheduledEmailsApi;

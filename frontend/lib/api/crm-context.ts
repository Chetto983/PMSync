/**
 * CRM Context API module
 *
 * Backend: CrmModule > ContextController (T-2002)
 * Endpoints: /api/v1/crm/context
 */
import { apiClient } from '../api-client';

// ---- Types ----

export interface CrmContextDeal {
  id: string;
  name: string;
  amount: string | null;
  currency: string;
  stage: { id: string; name: string; color: string | null; probability: number } | null;
}

export interface CrmContextTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface CrmContextAccount {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
}

export interface CrmContextActivity {
  id: string;
  type: string;
  content: string | null;
  createdAt: string;
}

export interface CrmContactContext {
  contact: {
    id: string;
    displayName: string | null;
    company: string | null;
    email: string | null;
    tags: string[];
  };
  account: CrmContextAccount | null;
  deals: CrmContextDeal[];
  tickets: CrmContextTicket[];
  recentActivities: CrmContextActivity[];
  emailCount: number;
  lastInteraction: string | null;
}

// ---- API ----

export const crmContextApi = {
  getByContactId(contactId: string) {
    return apiClient.get<CrmContactContext>(`/crm/context/${contactId}`);
  },

  getByEmail(email: string) {
    return apiClient.get<CrmContactContext | null>('/crm/context/by-email', {
      params: { email },
    });
  },
};

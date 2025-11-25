import { apiClient } from '../api-client';

// Types
export type JobRole =
  | 'EXECUTIVE'
  | 'MANAGER'
  | 'IC'
  | 'FREELANCER'
  | 'STUDENT'
  | 'SUPPORT'
  | 'SALES'
  | 'TECHNICAL';

export type CommunicationStyle = 'FORMAL' | 'CASUAL' | 'TECHNICAL';
export type ResponseLength = 'CONCISE' | 'MODERATE' | 'DETAILED';
export type ProactivityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type UserProfile = {
  jobRole: JobRole;
  jobTitle?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  communicationStyle: CommunicationStyle;
  responseLength: ResponseLength;
  proactivityLevel: ProactivityLevel;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  timezone: string;
  language: string;
};

export type Memory = {
  id: string;
  tenantId: string;
  userId: string;
  type: 'PREFERENCE' | 'FACT' | 'INTERACTION' | 'FEEDBACK';
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type JobRoleTemplate = {
  role: JobRole;
  name: string;
  description: string;
  defaults: Partial<UserProfile>;
};

// API
export const personalizationApi = {
  // Get user profile
  getProfile() {
    return apiClient.get<{ success: boolean; profile: UserProfile }>(
      '/ai/personalization/profile'
    );
  },

  // Update user profile
  updateProfile(profile: Partial<UserProfile>) {
    return apiClient.patch<{ success: boolean; profile: UserProfile }>(
      '/ai/personalization/profile',
      profile
    );
  },

  // Get available job role templates
  getJobRoleTemplates() {
    return apiClient.get<{ success: boolean; templates: JobRoleTemplate[] }>(
      '/ai/personalization/templates'
    );
  },

  // Get memories
  getMemories(params?: { type?: string; limit?: number }) {
    return apiClient.get<{ success: boolean; memories: Memory[] }>(
      '/ai/personalization/memories',
      { params }
    );
  },

  // Store a memory
  storeMemory(memory: {
    type: Memory['type'];
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    return apiClient.post<{ success: boolean; memory: Memory }>(
      '/ai/personalization/memories',
      memory
    );
  },

  // Delete a memory
  deleteMemory(memoryId: string) {
    return apiClient.delete<{ success: boolean }>(
      `/ai/personalization/memories/${memoryId}`
    );
  },

  // Clear all memories
  clearAllMemories() {
    return apiClient.delete<{ success: boolean; deleted: number }>(
      '/ai/personalization/memories'
    );
  },
};

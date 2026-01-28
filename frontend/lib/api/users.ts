
import { apiClient } from '../api-client';

export interface UserPreferences {
  id: string;
  userId: string;
  folderOrders?: Record<string, string[]>;
  sidebarSmartFiltersExpanded?: boolean;
  sidebarLabelsExpanded?: boolean;
  theme?: string;
  language?: string;
  timezone?: string;
  emailDensity?: string;
  // AI Feature Toggles
  aiSmartRepliesEnabled?: boolean;
  aiSummarizationEnabled?: boolean;
  aiSchedulingEnabled?: boolean;
  aiAutoTriageEnabled?: boolean;
  aiAutoApproveThreshold?: number;
  // AI Personalization
  jobTitle?: string;
  jobRole?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  communicationStyle?: string;
  responseLength?: string;
  proactivityLevel?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  notificationFrequency?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePreferencesData {
  folderOrders?: Record<string, string[]>;
  sidebarSmartFiltersExpanded?: boolean;
  sidebarLabelsExpanded?: boolean;
  theme?: string;
  language?: string;
  timezone?: string;
  emailDensity?: string;
  // AI Personalization
  jobTitle?: string;
  jobRole?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  communicationStyle?: string;
  responseLength?: string;
  proactivityLevel?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
  notificationFrequency?: 'IMMEDIATE' | 'DIGEST' | 'MINIMAL';
  aiAutoApproveThreshold?: number;
  aiSmartRepliesEnabled?: boolean;
  aiSummarizationEnabled?: boolean;
  aiSchedulingEnabled?: boolean;
  aiAutoTriageEnabled?: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
  isMfaEnabled: boolean;
  lastLogin: string | null;
  createdAt: string;
}

export const usersApi = {
  /**
   * Get current user profile
   */
  getProfile: async (): Promise<UserProfile> => {
    const response = await apiClient.get('/users/me');
    return response.data;
  },

  /**
   * Update user profile (name, avatar)
   */
  updateProfile: async (data: { firstName?: string; lastName?: string; avatarUrl?: string }): Promise<UserProfile> => {
    const response = await apiClient.put('/users/me', data);
    return response.data;
  },

  /**
   * Upload user avatar (base64 data URL)
   */
  uploadAvatar: async (avatarUrl: string): Promise<{ id: string; avatarUrl: string }> => {
    const response = await apiClient.put('/users/me/avatar', { avatarUrl });
    return response.data;
  },

  /**
   * Delete user avatar
   */
  deleteAvatar: async (): Promise<{ id: string; avatarUrl: null }> => {
    const response = await apiClient.delete('/users/me/avatar');
    return response.data;
  },

  /**
   * Get user preferences
   */
  getPreferences: async (): Promise<UserPreferences> => {
    const response = await apiClient.get('/users/me/preferences');
    return response.data;
  },

  /**
   * Update user preferences
   */
  updatePreferences: async (data: UpdatePreferencesData): Promise<UserPreferences> => {
    const response = await apiClient.patch('/users/me/preferences', data);
    return response.data;
  },

  /**
   * Delete user account (GDPR)
   * Permanently deletes user and all associated data
   */
  deleteAccount: async (): Promise<void> => {
    await apiClient.delete('/users/me');
  },
};

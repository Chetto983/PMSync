
import { apiClient } from '../api-client';

export interface UserPreferences {
  id: string;
  userId: string;
  folderOrders?: Record<string, string[]>;
  sidebarSmartFiltersExpanded?: boolean;
  sidebarLabelsExpanded?: boolean;
  theme?: string;
  language?: string;
  emailDensity?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePreferencesData {
  folderOrders?: Record<string, string[]>;
  sidebarSmartFiltersExpanded?: boolean;
  sidebarLabelsExpanded?: boolean;
  theme?: string;
  language?: string;
  emailDensity?: string;
}

export const usersApi = {
  updateProfile: (data: { firstName?: string; lastName?: string }) => {
    return apiClient.put('/users/me', data);
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

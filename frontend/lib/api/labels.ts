import { apiClient } from '../api-client';

// Temporary Email type - will be replaced when email API is rebuilt
interface Email {
  id: string;
  subject?: string;
  from: string;
  to: string[];
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
}

// ===== UTILITIES =====

/**
 * Calculate text color (black or white) based on background color for optimal contrast
 */
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const color = hexColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

/**
 * Convert hex color string to LabelColor object
 */
export function hexToLabelColor(hexColor: string): LabelColor {
  return {
    backgroundColor: hexColor,
    textColor: getContrastColor(hexColor),
  };
}

/**
 * Extract backgroundColor from LabelColor object or return hex string
 */
export function labelColorToHex(color: LabelColor | null): string {
  return color?.backgroundColor || '#9E9E9E'; // Default grey
}

// ===== TYPES =====

export interface LabelColor {
  backgroundColor: string;
  textColor: string;
}

export interface Label {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  type: 'SYSTEM' | 'USER';
  color: LabelColor | null;
  icon: string | null;
  parentId: string | null;
  level: number;
  orderIndex: number;
  isArchived: boolean;
  aiPrompt: string | null;
  createdAt: string;
  updatedAt: string;
  children?: Label[];
  _count?: {
    emailLabels: number;
  };
}

export interface CreateLabelDto {
  name: string;
  color?: LabelColor;
  icon?: string;
  parentId?: string;
  aiPrompt?: string;
}

export interface UpdateLabelDto {
  name?: string;
  color?: LabelColor | null;
  icon?: string | null;
  parentId?: string | null;
  orderIndex?: number;
  aiPrompt?: string | null;
}

export interface AddEmailsToLabelDto {
  emailIds: string[];
}

export interface ReorderLabelsDto {
  labelIds: string[];
}

export interface LabelsResponse {
  labels: Label[];
}

export interface LabelResponse {
  label: Label;
}

export interface LabelEmailsResponse {
  emails: Email[];
}

// ===== API CLIENT =====

export const labelsApi = {
  /**
   * List all labels for current user
   * GET /labels
   */
  async listLabels(): Promise<LabelsResponse> {
    const response = await apiClient.get('/labels');
    return response.data;
  },

  /**
   * Get a specific label by ID
   * GET /labels/:id
   */
  async getLabel(labelId: string): Promise<LabelResponse> {
    const response = await apiClient.get(`/labels/${labelId}`);
    return response.data;
  },

  /**
   * Create a new label
   * POST /labels
   */
  async createLabel(dto: CreateLabelDto): Promise<LabelResponse> {
    const response = await apiClient.post('/labels', dto);
    return response.data;
  },

  /**
   * Update a label
   * PUT /labels/:id
   */
  async updateLabel(labelId: string, dto: UpdateLabelDto): Promise<LabelResponse> {
    const response = await apiClient.put(`/labels/${labelId}`, dto);
    return response.data;
  },

  /**
   * Delete a label
   * DELETE /labels/:id
   */
  async deleteLabel(labelId: string): Promise<void> {
    await apiClient.delete(`/labels/${labelId}`);
  },

  /**
   * Add emails to a label
   * POST /labels/:id/emails
   */
  async addEmailsToLabel(labelId: string, dto: AddEmailsToLabelDto): Promise<{ count: number; emails: Email[] }> {
    const response = await apiClient.post(`/labels/${labelId}/emails`, dto);
    return response.data;
  },

  /**
   * Remove an email from a label
   * DELETE /labels/:id/emails/:emailId
   */
  async removeEmailFromLabel(labelId: string, emailId: string): Promise<{ email: Email }> {
    const response = await apiClient.delete(`/labels/${labelId}/emails/${emailId}`);
    return response.data;
  },

  /**
   * Get all emails for a label
   * GET /labels/:id/emails
   */
  async getEmailsForLabel(labelId: string): Promise<LabelEmailsResponse> {
    const response = await apiClient.get(`/labels/${labelId}/emails`);
    return response.data;
  },

  /**
   * Reorder labels
   * POST /labels/reorder
   */
  async reorderLabels(dto: ReorderLabelsDto): Promise<void> {
    await apiClient.post('/labels/reorder', dto);
  },
};

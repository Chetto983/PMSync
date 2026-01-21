/**
 * Email Templates API Client
 *
 * Endpoints:
 * - GET /emails/templates - list all
 * - GET /emails/templates/categories - get unique categories
 * - GET /emails/templates/default - get default
 * - GET /emails/templates/:id - get one
 * - POST /emails/templates - create
 * - PATCH /emails/templates/:id - update
 * - DELETE /emails/templates/:id - delete
 * - POST /emails/templates/:id/set-default - set as default
 * - POST /emails/templates/:id/duplicate - duplicate template
 */
import { apiClient } from '../api-client';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  category: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateListResponse {
  templates: EmailTemplate[];
  total: number;
}

export interface CreateTemplateDto {
  name: string;
  subject: string;
  bodyHtml: string;
  category?: string;
  isDefault?: boolean;
}

export interface UpdateTemplateDto {
  name?: string;
  subject?: string;
  bodyHtml?: string;
  category?: string;
  isDefault?: boolean;
}

export const templatesApi = {
  /**
   * List all templates, optionally filtered by category
   */
  list(category?: string) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    const query = params.toString();
    return apiClient.get<TemplateListResponse>(`/emails/templates${query ? `?${query}` : ''}`);
  },

  /**
   * Get unique categories used by user's templates
   */
  getCategories() {
    return apiClient.get<string[]>('/emails/templates/categories');
  },

  /**
   * Get the default template
   */
  getDefault() {
    return apiClient.get<EmailTemplate | null>('/emails/templates/default');
  },

  /**
   * Get a single template by ID
   */
  get(id: string) {
    return apiClient.get<EmailTemplate>(`/emails/templates/${id}`);
  },

  /**
   * Create a new template
   */
  create(dto: CreateTemplateDto) {
    return apiClient.post<EmailTemplate>('/emails/templates', dto);
  },

  /**
   * Update a template
   */
  update(id: string, dto: UpdateTemplateDto) {
    return apiClient.patch<EmailTemplate>(`/emails/templates/${id}`, dto);
  },

  /**
   * Delete a template
   */
  delete(id: string) {
    return apiClient.delete<{ success: boolean }>(`/emails/templates/${id}`);
  },

  /**
   * Set a template as the default
   */
  setDefault(id: string) {
    return apiClient.post<EmailTemplate>(`/emails/templates/${id}/set-default`, {});
  },

  /**
   * Duplicate a template
   */
  duplicate(id: string, newName?: string) {
    const params = new URLSearchParams();
    if (newName) params.set('name', newName);
    const query = params.toString();
    return apiClient.post<EmailTemplate>(`/emails/templates/${id}/duplicate${query ? `?${query}` : ''}`, {});
  },
};

export default templatesApi;

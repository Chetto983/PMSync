/**
 * Email Signatures API Client
 *
 * Endpoints:
 * - GET /emails/signatures - list all
 * - GET /emails/signatures/default - get default
 * - GET /emails/signatures/:id - get one
 * - POST /emails/signatures - create
 * - PATCH /emails/signatures/:id - update
 * - DELETE /emails/signatures/:id - delete
 * - POST /emails/signatures/:id/set-default - set as default
 */
import { apiClient } from '../api-client';

export interface EmailSignature {
  id: string;
  name: string;
  content: string; // HTML content
  providerId: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSignatureDto {
  name: string;
  content: string;
  providerId?: string;
  isDefault?: boolean;
}

export interface UpdateSignatureDto {
  name?: string;
  content?: string;
  providerId?: string;
  isDefault?: boolean;
}

export const signaturesApi = {
  /**
   * List all signatures, optionally filtered by provider
   */
  list(providerId?: string) {
    const params = new URLSearchParams();
    if (providerId) params.set('providerId', providerId);
    const query = params.toString();
    return apiClient.get<EmailSignature[]>(`/emails/signatures${query ? `?${query}` : ''}`);
  },

  /**
   * Get the default signature for a provider (or global default)
   */
  getDefault(providerId?: string) {
    const params = new URLSearchParams();
    if (providerId) params.set('providerId', providerId);
    const query = params.toString();
    return apiClient.get<EmailSignature | null>(`/emails/signatures/default${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single signature by ID
   */
  get(id: string) {
    return apiClient.get<EmailSignature>(`/emails/signatures/${id}`);
  },

  /**
   * Create a new signature
   */
  create(dto: CreateSignatureDto) {
    return apiClient.post<EmailSignature>('/emails/signatures', dto);
  },

  /**
   * Update a signature
   */
  update(id: string, dto: UpdateSignatureDto) {
    return apiClient.patch<EmailSignature>(`/emails/signatures/${id}`, dto);
  },

  /**
   * Delete a signature
   */
  delete(id: string) {
    return apiClient.delete<{ success: boolean }>(`/emails/signatures/${id}`);
  },

  /**
   * Set a signature as the default
   */
  setDefault(id: string) {
    return apiClient.post<EmailSignature>(`/emails/signatures/${id}/set-default`, {});
  },
};

export default signaturesApi;

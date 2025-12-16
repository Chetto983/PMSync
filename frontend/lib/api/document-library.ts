/**
 * Document Library API
 *
 * Frontend client for the Document Library (P2.5) backend endpoints.
 * Provides RAG-powered document management using Mistral's document_library tool.
 *
 * Features:
 * - Library CRUD operations
 * - Document upload and management
 * - RAG-powered document queries with citations
 * - Multi-library search
 *
 * @see backend/src/modules/ai/voltagent/controllers/document-library.controller.ts
 * @see https://docs.mistral.ai/agents/tools/built-in/document_library
 */
import { apiClient, API_BASE_URL } from '../api-client';

// ============================================================================
// Types
// ============================================================================

export interface DocumentLibrary {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryDocument {
  id: string;
  libraryId: string;
  filename: string;
  mimeType: string;
  size: number;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentCitation {
  documentId: string;
  filename: string;
  snippet: string;
  pageNumber?: number;
  confidence: number;
}

export interface DocumentQueryResult {
  answer: string;
  citations: DocumentCitation[];
  sourcesUsed: string[];
  confidence: number;
  cached: boolean;
}

export interface CreateLibraryPayload {
  name: string;
  description?: string;
}

export interface QueryDocumentsPayload {
  query: string;
  libraryIds?: string[];
  locale?: string;
}

// ============================================================================
// API Client
// ============================================================================

export const documentLibraryApi = {
  // ==========================================================================
  // Library Management
  // ==========================================================================

  /**
   * Create a new document library.
   *
   * @param payload.name - Library name (1-100 characters)
   * @param payload.description - Optional description (max 500 characters)
   */
  createLibrary(payload: CreateLibraryPayload) {
    return apiClient.post<{
      success: boolean;
      library: DocumentLibrary;
    }>('/api/v1/voltagent/documents/libraries', payload);
  },

  /**
   * List all document libraries for the current tenant.
   */
  listLibraries() {
    return apiClient.get<{
      success: boolean;
      libraries: DocumentLibrary[];
      count: number;
    }>('/api/v1/voltagent/documents/libraries');
  },

  /**
   * Get details of a specific document library.
   *
   * @param libraryId - Library ID
   */
  getLibrary(libraryId: string) {
    return apiClient.get<{
      success: boolean;
      library: DocumentLibrary;
    }>(`/api/v1/voltagent/documents/libraries/${encodeURIComponent(libraryId)}`);
  },

  /**
   * Delete a document library and all its documents.
   *
   * @param libraryId - Library ID
   */
  deleteLibrary(libraryId: string) {
    return apiClient.delete<{
      success: boolean;
      message: string;
    }>(`/api/v1/voltagent/documents/libraries/${encodeURIComponent(libraryId)}`);
  },

  // ==========================================================================
  // Document Management
  // ==========================================================================

  /**
   * Upload a document to a library.
   * Supported formats: PDF, TXT, MD, DOC, DOCX.
   * Maximum file size: 10MB.
   *
   * @param libraryId - Library ID
   * @param file - File to upload
   * @param onProgress - Optional progress callback (0-100)
   */
  uploadDocument(
    libraryId: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<{ success: boolean; document: LibraryDocument }> {
    const formData = new FormData();
    formData.append('file', file);

    // Get auth token from localStorage
    let authToken = '';
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('auth-storage');
        if (stored) {
          const parsed = JSON.parse(stored);
          authToken = parsed?.state?.token || '';
        }
      } catch {
        // Ignore
      }
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error('Invalid response format'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      xhr.open(
        'POST',
        `${API_BASE_URL}/api/v1/voltagent/documents/libraries/${encodeURIComponent(libraryId)}/documents`,
      );
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      xhr.send(formData);
    });
  },

  /**
   * List all documents in a library.
   *
   * @param libraryId - Library ID
   */
  listDocuments(libraryId: string) {
    return apiClient.get<{
      success: boolean;
      documents: LibraryDocument[];
      count: number;
    }>(`/api/v1/voltagent/documents/libraries/${encodeURIComponent(libraryId)}/documents`);
  },

  /**
   * Delete a document from a library.
   *
   * @param libraryId - Library ID
   * @param documentId - Document ID
   */
  deleteDocument(libraryId: string, documentId: string) {
    return apiClient.delete<{
      success: boolean;
      message: string;
    }>(
      `/api/v1/voltagent/documents/libraries/${encodeURIComponent(libraryId)}/documents/${encodeURIComponent(documentId)}`,
    );
  },

  // ==========================================================================
  // Document Query (RAG)
  // ==========================================================================

  /**
   * Query documents using Mistral's document_library RAG tool.
   *
   * Features:
   * - Natural language questions
   * - Automatic chunking and embedding
   * - Citation support with document sources
   * - Multi-library search
   *
   * Results are cached for 15 minutes.
   *
   * @param payload.query - Natural language query (5-1000 characters)
   * @param payload.libraryIds - Optional library IDs to search (searches all if not specified)
   * @param payload.locale - Response locale (default: 'en')
   */
  queryDocuments(payload: QueryDocumentsPayload) {
    return apiClient.post<{
      success: boolean;
      result: DocumentQueryResult;
    }>('/api/v1/voltagent/documents/query', payload);
  },

  /**
   * Get document library service status.
   * Check if the document library service is enabled and configured.
   */
  getStatus() {
    return apiClient.get<{
      success: boolean;
      enabled: boolean;
      features: string[];
    }>('/api/v1/voltagent/documents/status');
  },
};

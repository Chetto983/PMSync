/**
 * CRM Import/Export API module
 *
 * Backend: CrmModule > ImportExportController
 * Endpoints: /api/v1/crm/contacts/import, /api/v1/crm/contacts/export, /api/v1/crm/accounts/export
 */
import { apiClient } from '../api-client';

export interface ColumnMapping {
  source: string;
  target: string;
}

export interface ImportPreviewResponse {
  headers: string[];
  preview: Record<string, string>[];
  totalRows: number;
}

export interface ImportJobResponse {
  jobId: string;
  message: string;
}

export const crmImportExportApi = {
  /** Parse CSV file and return column headers */
  async parseHeaders(file: File): Promise<{ headers: string[] }> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post<{ headers: string[] }>(
      '/crm/contacts/import/headers',
      form,
    );
    return res.data;
  },

  /** Preview mapped CSV rows */
  async previewImport(
    file: File,
    mappings: ColumnMapping[],
  ): Promise<ImportPreviewResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('mappings', JSON.stringify(mappings));
    const res = await apiClient.post<ImportPreviewResponse>(
      '/crm/contacts/import/preview',
      form,
    );
    return res.data;
  },

  /** Start async CSV import */
  async importContacts(
    file: File,
    mappings: ColumnMapping[],
  ): Promise<ImportJobResponse> {
    const form = new FormData();
    form.append('file', file);
    form.append('mappings', JSON.stringify(mappings));
    const res = await apiClient.post<ImportJobResponse>(
      '/crm/contacts/import',
      form,
    );
    return res.data;
  },

  /** Download contacts as XLSX */
  async exportContactsXlsx(params?: { search?: string }) {
    const response = await apiClient.get('/crm/contacts/export', {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Download accounts as XLSX */
  async exportAccountsXlsx(params?: { search?: string; industry?: string }) {
    const response = await apiClient.get('/crm/accounts/export', {
      params,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

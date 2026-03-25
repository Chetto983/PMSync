/**
 * CRM Custom Fields API module
 *
 * Backend: CrmModule > CustomFieldController
 * Endpoints: /api/v1/crm/custom-fields
 */
import { apiClient } from '../api-client';

// ---- Types ----

export type CustomFieldEntity = 'account' | 'contact' | 'deal';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select';

export interface CrmCustomField {
  id: string;
  tenantId: string;
  entity: CustomFieldEntity;
  name: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrmCustomFieldValue {
  id: string;
  fieldId: string;
  entityId: string;
  tenantId: string;
  value: unknown;
  field: CrmCustomField;
}

export interface CreateCustomFieldDto {
  entity: CustomFieldEntity;
  name: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
  position?: number;
}

export interface UpdateCustomFieldDto {
  label?: string;
  options?: string[];
  required?: boolean;
  position?: number;
}

// ---- API ----

export const crmCustomFieldsApi = {
  list(entity?: CustomFieldEntity) {
    return apiClient.get<CrmCustomField[]>('/crm/custom-fields', {
      params: entity ? { entity } : undefined,
    });
  },

  create(dto: CreateCustomFieldDto) {
    return apiClient.post<CrmCustomField>('/crm/custom-fields', dto);
  },

  update(id: string, dto: UpdateCustomFieldDto) {
    return apiClient.patch<CrmCustomField>(`/crm/custom-fields/${id}`, dto);
  },

  delete(id: string) {
    return apiClient.delete(`/crm/custom-fields/${id}`);
  },

  getValues(entityId: string) {
    return apiClient.get<CrmCustomFieldValue[]>(
      `/crm/custom-fields/values/${entityId}`,
    );
  },

  setValues(entityId: string, values: Array<{ fieldId: string; value: unknown }>) {
    return apiClient.put<CrmCustomFieldValue[]>(
      `/crm/custom-fields/values/${entityId}`,
      { values },
    );
  },
};

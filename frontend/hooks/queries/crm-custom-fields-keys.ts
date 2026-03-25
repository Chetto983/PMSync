import type { CustomFieldEntity } from '@/lib/api/crm-custom-fields';

export const crmCustomFieldsKeys = {
  all: ['crm-custom-fields'] as const,
  list: (entity?: CustomFieldEntity) =>
    entity
      ? ([...crmCustomFieldsKeys.all, 'list', entity] as const)
      : ([...crmCustomFieldsKeys.all, 'list'] as const),
  values: (entityId: string) =>
    [...crmCustomFieldsKeys.all, 'values', entityId] as const,
} as const;

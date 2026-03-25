/**
 * CustomFieldsSection — loads and renders all custom fields for a given entity.
 *
 * Drop into any entity detail page (Account, Contact, Deal):
 *   <CustomFieldsSection entity="contact" entityId={contact.id} />
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Skeleton,
  Alert,
  Button,
} from '@mui/material';
import { Save } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useCustomFields,
  useCustomFieldValues,
  useSetCustomFieldValues,
} from '@/hooks/queries/use-crm-custom-fields';
import type { CustomFieldEntity, CrmCustomFieldValue } from '@/lib/api/crm-custom-fields';
import { CustomFieldRenderer } from './CustomFieldRenderer';

interface CustomFieldsSectionProps {
  entity: CustomFieldEntity;
  entityId: string;
  disabled?: boolean;
}

export function CustomFieldsSection({
  entity,
  entityId,
  disabled = false,
}: CustomFieldsSectionProps) {
  const t = useTranslations();
  const tcf = t.crmCustomFields;

  const { data: fields, isLoading: fieldsLoading } = useCustomFields(entity);
  const { data: fieldValues, isLoading: valuesLoading } = useCustomFieldValues(entityId);
  const setValues = useSetCustomFieldValues();

  const [localValues, setLocalValues] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);

  // Sync remote values to local editable copy — legitimate pattern for forms
  useEffect(() => {
    if (!fieldValues) return;
    const map: Record<string, unknown> = {};
    for (const fv of fieldValues as CrmCustomFieldValue[]) {
      map[fv.fieldId] = fv.value;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing remote -> local editable copy
    setLocalValues(map);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset dirty flag on remote data sync
    setDirty(false);
  }, [fieldValues]);

  const handleChange = useCallback((fieldId: string, value: unknown) => {
    setLocalValues((prev) => ({ ...prev, [fieldId]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!fields) return;
    const values = fields.map((f) => ({
      fieldId: f.id,
      value: localValues[f.id] ?? null,
    }));
    setValues.mutate({ entityId, values }, { onSuccess: () => setDirty(false) });
  }, [fields, localValues, entityId, setValues]);

  if (fieldsLoading || valuesLoading) {
    return (
      <Box sx={{ py: 2 }}>
        <Skeleton width="30%" height={20} sx={{ mb: 1 }} />
        <Skeleton width="100%" height={40} />
        <Skeleton width="100%" height={40} sx={{ mt: 1 }} />
      </Box>
    );
  }

  if (!fields || fields.length === 0) return null;

  return (
    <Box sx={{ py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {tcf?.title ?? 'Custom Fields'}
        </Typography>
        {dirty && (
          <Button
            size="small"
            variant="contained"
            startIcon={<Save size={14} />}
            onClick={handleSave}
            disabled={setValues.isPending || disabled}
          >
            {t.common?.save ?? 'Save'}
          </Button>
        )}
      </Box>

      {setValues.isError && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {(setValues.error as Error)?.message ?? 'Failed to save custom fields'}
        </Alert>
      )}

      <Grid container spacing={2}>
        {fields.map((field) => (
          <Grid key={field.id} size={{ xs: 12, sm: 6 }}>
            <CustomFieldRenderer
              field={field}
              value={localValues[field.id] ?? null}
              onChange={(v) => handleChange(field.id, v)}
              disabled={disabled}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

/**
 * CustomFieldsAdmin — admin page component for managing custom fields.
 * Lists fields grouped by entity, with create/edit/delete dialogs.
 */

import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  Skeleton,
  Tabs,
  Tab,
  Breadcrumbs,
  Link as MuiLink,
} from '@mui/material';
import NextLink from 'next/link';
import { Plus, Pencil, Trash2, Settings, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useCustomFields,
  useCreateCustomField,
  useUpdateCustomField,
  useDeleteCustomField,
} from '@/hooks/queries/use-crm-custom-fields';
import type {
  CustomFieldEntity,
  CustomFieldType,
  CrmCustomField,
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
} from '@/lib/api/crm-custom-fields';

const ENTITIES: CustomFieldEntity[] = ['contact', 'account', 'deal'];
const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'select'];

interface FieldFormState {
  entity: CustomFieldEntity;
  name: string;
  label: string;
  type: CustomFieldType;
  options: string;
  required: boolean;
  position: number;
}

const EMPTY_FORM: FieldFormState = {
  entity: 'contact',
  name: '',
  label: '',
  type: 'text',
  options: '',
  required: false,
  position: 0,
};

export function CustomFieldsAdmin() {
  const router = useRouter();
  const t = useTranslations();
  const tcf = t.crmCustomFields;

  const [activeTab, setActiveTab] = useState(0);
  const entity = ENTITIES[activeTab];

  const { data: fields, isLoading } = useCustomFields(entity);
  const createField = useCreateCustomField();
  const updateField = useUpdateCustomField();
  const deleteField = useDeleteCustomField();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CrmCustomField | null>(null);
  const [form, setForm] = useState<FieldFormState>(EMPTY_FORM);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingField, setDeletingField] = useState<CrmCustomField | null>(null);

  const entityLabel = useCallback(
    (e: CustomFieldEntity) => tcf?.entities?.[e] ?? e,
    [tcf],
  );

  const typeLabel = useCallback(
    (ft: CustomFieldType) => tcf?.types?.[ft] ?? ft,
    [tcf],
  );

  const openCreate = () => {
    setEditingField(null);
    setForm({ ...EMPTY_FORM, entity });
    setDialogOpen(true);
  };

  const openEdit = (field: CrmCustomField) => {
    setEditingField(field);
    setForm({
      entity: field.entity,
      name: field.name,
      label: field.label,
      type: field.type,
      options: (field.options ?? []).join(', '),
      required: field.required,
      position: field.position,
    });
    setDialogOpen(true);
  };

  const openDelete = (field: CrmCustomField) => {
    setDeletingField(field);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = () => {
    const options =
      form.type === 'select' && form.options.trim()
        ? form.options.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

    if (editingField) {
      const dto: UpdateCustomFieldDto = {
        label: form.label,
        options,
        required: form.required,
        position: form.position,
      };
      updateField.mutate(
        { id: editingField.id, dto },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      const dto: CreateCustomFieldDto = {
        entity: form.entity,
        name: form.name,
        label: form.label,
        type: form.type,
        options,
        required: form.required,
        position: form.position,
      };
      createField.mutate(dto, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleDelete = () => {
    if (!deletingField) return;
    deleteField.mutate(deletingField.id, {
      onSuccess: () => setDeleteDialogOpen(false),
    });
  };

  const isSaving = createField.isPending || updateField.isPending;
  const saveError = createField.error || updateField.error;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 2 }}>
        <MuiLink component={NextLink} href="/dashboard" underline="hover" color="text.secondary">
          Dashboard
        </MuiLink>
        <MuiLink component={NextLink} href="/dashboard/crm/deals" underline="hover" color="text.secondary">
          CRM
        </MuiLink>
        <Typography color="text.primary">{tcf?.title ?? 'Custom Fields'}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton size="small" onClick={() => router.back()}>
          <ArrowLeft size={20} />
        </IconButton>
        <Settings size={28} style={{ opacity: 0.7 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5">{tcf?.title ?? 'Custom Fields'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {tcf?.description ?? 'Configure custom fields for CRM entities.'}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={openCreate}
        >
          {tcf?.newField ?? 'New Field'}
        </Button>
      </Box>

      {/* Entity tabs */}
      <Tabs
        value={activeTab}
        onChange={(_e, v) => setActiveTab(v as number)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        {ENTITIES.map((e) => (
          <Tab key={e} label={entityLabel(e)} />
        ))}
      </Tabs>

      {/* Fields table */}
      {isLoading ? (
        <Box>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </Box>
      ) : !fields || fields.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            {tcf?.noFields ?? 'No custom fields configured.'}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {tcf?.noFieldsDescription ?? 'Add custom fields to track additional data.'}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tcf?.fieldName ?? 'Name'}</TableCell>
                <TableCell>{tcf?.fieldLabel ?? 'Label'}</TableCell>
                <TableCell>{tcf?.fieldType ?? 'Type'}</TableCell>
                <TableCell>{tcf?.required ?? 'Required'}</TableCell>
                <TableCell>{tcf?.options ?? 'Options'}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {field.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{field.label}</TableCell>
                  <TableCell>
                    <Chip
                      label={typeLabel(field.type)}
                      variant="outlined"
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{field.required ? '✓' : '—'}</TableCell>
                  <TableCell>
                    {field.type === 'select' && field.options
                      ? (field.options as string[]).join(', ')
                      : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(field)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton size="small" onClick={() => openDelete(field)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingField
            ? (tcf?.editField ?? 'Edit Field')
            : (tcf?.newField ?? 'New Field')}
        </DialogTitle>
        <DialogContent>
          {saveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {(saveError as Error)?.message ?? 'Failed to save'}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {!editingField && (
              <>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label={tcf?.entity ?? 'Entity'}
                  value={form.entity}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      entity: e.target.value as CustomFieldEntity,
                    }))
                  }
                >
                  {ENTITIES.map((e) => (
                    <MenuItem key={e} value={e}>
                      {entityLabel(e)}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  size="small"
                  fullWidth
                  label={tcf?.fieldName ?? 'Field Name'}
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  helperText="snake_case identifier (e.g. linkedin_url)"
                />

                <TextField
                  select
                  size="small"
                  fullWidth
                  label={tcf?.fieldType ?? 'Type'}
                  value={form.type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      type: e.target.value as CustomFieldType,
                    }))
                  }
                >
                  {FIELD_TYPES.map((ft) => (
                    <MenuItem key={ft} value={ft}>
                      {typeLabel(ft)}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            )}

            <TextField
              size="small"
              fullWidth
              label={tcf?.fieldLabel ?? 'Label'}
              value={form.label}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, label: e.target.value }))
              }
            />

            {(form.type === 'select' || (editingField && editingField.type === 'select')) && (
              <TextField
                size="small"
                fullWidth
                label={tcf?.options ?? 'Options'}
                value={form.options}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, options: e.target.value }))
                }
                helperText={tcf?.optionsHelp ?? 'Comma-separated list of options.'}
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={form.required}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, required: e.target.checked }))
                  }
                />
              }
              label={tcf?.required ?? 'Required'}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>
            {t.common?.cancel ?? 'Cancel'}
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={isSaving || (!editingField && (!form.name || !form.label))}
          >
            {t.common?.save ?? 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{tcf?.deleteField ?? 'Delete Field'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {tcf?.deleteConfirm ?? 'Are you sure? All values for this field will be lost.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            {t.common?.cancel ?? 'Cancel'}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleteField.isPending}
          >
            {t.common?.delete ?? 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

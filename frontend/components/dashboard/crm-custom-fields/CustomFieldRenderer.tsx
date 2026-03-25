/**
 * CustomFieldRenderer — renders the correct MUI input for a custom field type.
 *
 * Usage:
 *   <CustomFieldRenderer field={field} value={val} onChange={(v) => ...} />
 *
 * Supports: text, number, date, select
 */

import React from 'react';
import { TextField, MenuItem } from '@mui/material';
import type { CrmCustomField } from '@/lib/api/crm-custom-fields';

interface CustomFieldRendererProps {
  field: CrmCustomField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
}

function normalizeValue(field: CrmCustomField, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (field.type === 'date' && typeof value === 'string') {
    // Ensure ISO date is formatted as YYYY-MM-DD for input[type=date]
    return value.slice(0, 10);
  }
  return String(value);
}

export function CustomFieldRenderer({
  field,
  value,
  onChange,
  disabled = false,
  size = 'small',
}: CustomFieldRendererProps) {
  const displayValue = normalizeValue(field, value);

  switch (field.type) {
    case 'number':
      return (
        <TextField
          fullWidth
          size={size}
          type="number"
          label={field.label}
          value={displayValue}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? null : Number(raw));
          }}
          required={field.required}
          disabled={disabled}
          slotProps={{ htmlInput: { min: 0, step: 'any' } }}
        />
      );

    case 'date':
      return (
        <TextField
          fullWidth
          size={size}
          type="date"
          label={field.label}
          value={displayValue}
          onChange={(e) => onChange(e.target.value || null)}
          required={field.required}
          disabled={disabled}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      );

    case 'select':
      return (
        <TextField
          select
          fullWidth
          size={size}
          label={field.label}
          value={displayValue}
          onChange={(e) => onChange(e.target.value || null)}
          required={field.required}
          disabled={disabled}
        >
          <MenuItem value="">—</MenuItem>
          {(field.options ?? []).map((opt) => (
            <MenuItem key={opt} value={opt}>
              {opt}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'text':
    default:
      return (
        <TextField
          fullWidth
          size={size}
          label={field.label}
          value={displayValue}
          onChange={(e) => onChange(e.target.value || null)}
          required={field.required}
          disabled={disabled}
        />
      );
  }
}

'use client';

/**
 * HitlPayloadEditor - Editable Payload Fields for HITL Actions
 *
 * Extracted from InlineActionCard.tsx renderPayloadFields().
 * Displays action payload fields with edit capability.
 */

import React from 'react';
import { Box, Typography, TextField, alpha, useTheme } from '@mui/material';

export interface HitlPayloadEditorProps {
  payload: Record<string, unknown>;
  editMode: boolean;
  onChange: (newPayload: Record<string, unknown>) => void;
  getFieldLabel: (field: string) => string;
}

const EDITABLE_FIELDS = ['to', 'cc', 'bcc', 'subject', 'body', 'title', 'location', 'attendees'];
const ARRAY_FIELDS = ['to', 'cc', 'bcc', 'attendees'];

export function HitlPayloadEditor({
  payload,
  editMode,
  onChange,
  getFieldLabel,
}: HitlPayloadEditorProps) {
  const theme = useTheme();

  const handleFieldChange = (key: string, value: string) => {
    onChange({
      ...payload,
      [key]: ARRAY_FIELDS.includes(key)
        ? value.split(',').map(s => s.trim())
        : value,
    });
  };

  return (
    <>
      {Object.entries(payload)
        .filter(([key]) => EDITABLE_FIELDS.includes(key))
        .map(([key, value]) => {
          if (value === undefined || value === null) return null;

          const displayValue = Array.isArray(value)
            ? value.join(', ')
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);

          const isMultiline = key === 'body';

          return (
            <Box key={key} sx={{ mb: 1.5 }}>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  fontSize: '0.65rem',
                }}
              >
                {getFieldLabel(key)}
              </Typography>
              {editMode ? (
                <TextField
                  fullWidth
                  size="small"
                  multiline={isMultiline}
                  rows={isMultiline ? 3 : 1}
                  value={displayValue}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  sx={{
                    mt: 0.5,
                    '& .MuiOutlinedInput-root': {
                      fontSize: '0.85rem',
                      bgcolor: alpha(theme.palette.background.paper, 0.5),
                    },
                  }}
                />
              ) : (
                <Typography
                  variant="body2"
                  sx={{
                    mt: 0.25,
                    color: 'text.primary',
                    wordBreak: 'break-word',
                    whiteSpace: isMultiline ? 'pre-wrap' : 'normal',
                  }}
                >
                  {displayValue || '-'}
                </Typography>
              )}
            </Box>
          );
        })}
    </>
  );
}

export default HitlPayloadEditor;

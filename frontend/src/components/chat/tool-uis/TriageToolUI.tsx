'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { Layers, AlertTriangle, ShieldAlert, CheckCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { BulkActionResult } from '../types';
import { HitlApprovalWrapper } from '../HitlApprovalCard';

function severitySx(severity: string): { bgcolor: string; color: string } {
  switch (severity) {
    case 'HIGH':
      return { bgcolor: 'error.light', color: 'error.dark' };
    case 'MEDIUM':
      return { bgcolor: 'warning.light', color: 'warning.dark' };
    default:
      return { bgcolor: 'action.hover', color: 'text.secondary' };
  }
}

export const TriageToolUI = makeAssistantToolUI<
  Record<string, unknown>,
  BulkActionResult
>({
  toolName: 'bulk_email_actions',
  render: ({ status, result, addResult, toolName, args }) => {
    if (status.type === 'requires-action') {
      return (
        <HitlApprovalWrapper
          status={status}
          addResult={addResult}
          toolName={toolName}
          args={args}
        />
      );
    }

    if (status.type === 'running') {
      return (
        <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} color="text.secondary">
            <Layers size={16} />
            <Typography variant="body2">Processing bulk action...</Typography>
          </Box>
        </Paper>
      );
    }

    if (status.type === 'incomplete' || !result || result.error) {
      return (
        <Paper
          variant="outlined"
          sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light', bgcolor: 'error.light' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertTriangle size={16} />
            <Typography variant="body2" color="error.main">
              {result?.error ?? 'Bulk action failed'}
            </Typography>
          </Box>
        </Paper>
      );
    }

    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {result.success ? (
                <CheckCircle size={16} color="var(--mui-palette-success-main)" />
              ) : (
                <Layers size={16} color="var(--mui-palette-primary-main)" />
              )}
              <Typography variant="body2" fontWeight={500}>
                {result.actionType ?? 'Bulk Action'}
              </Typography>
            </Box>
            {result.severity && (
              <Box
                component="span"
                sx={{
                  px: 0.75,
                  py: 0.25,
                  fontSize: '0.75rem',
                  borderRadius: '9999px',
                  ...severitySx(result.severity),
                }}
              >
                {result.severity}
              </Box>
            )}
          </Box>

          {result.summary && (
            <Typography variant="body2" color="text.secondary">
              {result.summary}
            </Typography>
          )}

          {result.payload?.count != null && (
            <Typography variant="caption" color="text.secondary">
              {result.payload.count} email{result.payload.count !== 1 ? 's' : ''} affected
              {result.payload.skipped ? ` (${result.payload.skipped} skipped)` : ''}
            </Typography>
          )}

          {result.requiresApproval && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderRadius: 1,
                p: 1,
                bgcolor: 'warning.light',
              }}
            >
              <ShieldAlert size={14} style={{ flexShrink: 0 }} />
              <Typography variant="caption" color="warning.dark">
                This action requires your approval before execution
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>
    );
  },
});

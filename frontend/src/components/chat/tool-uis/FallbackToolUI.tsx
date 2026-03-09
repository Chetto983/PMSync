'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { Code, Loader2 } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

export const FallbackToolUI = makeAssistantToolUI<unknown, unknown>({
  toolName: '*',
  render: ({ status, toolName, args, result }) => {
    const isRunning = status.type === 'running';

    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1, fontSize: '0.875rem' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isRunning ? (
            <Box component="span" sx={{ display: 'inline-flex', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }, animation: 'spin 1s linear infinite' }}>
              <Loader2 size={14} color="var(--mui-palette-primary-main)" />
            </Box>
          ) : (
            <Code size={14} color="var(--mui-palette-text-secondary)" />
          )}
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>
            {toolName}
          </Typography>
          <Typography
            sx={{
              ml: 'auto',
              fontSize: '0.68rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            {isRunning ? 'Running' : 'Complete'}
          </Typography>
        </Box>
        <Box component="details" sx={{ mt: 1 }}>
          <Typography
            component="summary"
            sx={{
              fontSize: '0.74rem',
              fontWeight: 600,
              color: 'text.secondary',
              cursor: 'pointer',
            }}
          >
            {isRunning ? 'Arguments' : 'Details'}
          </Typography>
          <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {args != null && (
              <Box
                component="pre"
                sx={{
                  m: 0,
                  maxHeight: 180,
                  overflow: 'auto',
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  p: '8px 10px',
                  fontSize: '0.72rem',
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(args, null, 2)}
              </Box>
            )}
            {result != null && (
              <Box
                component="pre"
                sx={{
                  m: 0,
                  maxHeight: 180,
                  overflow: 'auto',
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'action.hover',
                  p: '8px 10px',
                  fontSize: '0.72rem',
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(result, null, 2)}
              </Box>
            )}
          </Box>
        </Box>
      </Paper>
    );
  },
});

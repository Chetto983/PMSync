import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Brain, AlertTriangle, Tag } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { MemorySearchResult, MemoryItem } from '../types';

function typeSx(type: string): { bgcolor: string; color: string } {
  switch (type) {
    case 'FACT':
      return { bgcolor: 'info.light', color: 'info.dark' };
    case 'PREFERENCE':
      return { bgcolor: 'secondary.light', color: 'secondary.dark' };
    case 'CONTACT_NOTE':
      return { bgcolor: 'success.light', color: 'success.dark' };
    case 'PATTERN':
      return { bgcolor: 'warning.light', color: 'warning.dark' };
    default:
      return { bgcolor: 'action.hover', color: 'text.secondary' };
  }
}

function MemoryCard({ memory, isFirst }: { memory: MemoryItem; isFirst: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 0.75,
        borderTop: isFirst ? 0 : 1,
        borderColor: 'divider',
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: '0.625rem',
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          flexShrink: 0,
          mt: 0.25,
          ...typeSx(memory.type),
        }}
      >
        {memory.type}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
          {memory.content}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
          {memory.category && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <Tag size={10} />
              <Typography variant="caption" color="text.secondary">
                {memory.category}
              </Typography>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">
            {(memory.score * 100).toFixed(0)}% match
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function MemoryRender({
  status,
  result,
}: {
  status: { type: string; reason?: string; error?: unknown };
  result: MemorySearchResult | undefined;
}) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} color="text.secondary">
          <Brain size={16} />
          <Typography variant="body2">Searching memories...</Typography>
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
            {result?.error ?? 'Memory search failed'}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if ((result.results ?? []).length === 0) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {result.message ?? 'No memories found'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Brain size={16} color="var(--mui-palette-primary-main)" />
        <Typography variant="body2" fontWeight={500}>
          {(result.results ?? []).length} memor{(result.results ?? []).length === 1 ? 'y' : 'ies'} found
        </Typography>
      </Box>
      <Box>
        {(result.results ?? []).map((m, i) => (
          <MemoryCard key={`${m.type}-${i}`} memory={m} isFirst={i === 0} />
        ))}
      </Box>
    </Paper>
  );
}

export function MemoryRenderer({
  status,
  result,
}: ToolCallMessagePartProps<
  { query: string },
  MemorySearchResult
>) {
  return <MemoryRender status={status} result={result} />;
}

export function MemorySearchRenderer({
  status,
  result,
}: ToolCallMessagePartProps<
  { query: string },
  MemorySearchResult
>) {
  return <MemoryRender status={status} result={result} />;
}

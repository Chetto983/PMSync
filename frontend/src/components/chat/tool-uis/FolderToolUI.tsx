import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Folder, AlertCircle } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import type { FolderResult, FolderItem } from '../types';

function FolderRow({ folder, isFirst }: { folder: FolderItem; isFirst: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.75,
        pl: `${8 + folder.level * 16}px`,
        pr: 1,
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color 0.15s ease',
        ...(isFirst ? {} : { borderTop: 1, borderColor: 'divider' }),
      }}
    >
      <Folder size={14} color="var(--mui-palette-text-secondary)" style={{ flexShrink: 0 }} />
      <Typography
        variant="body2"
        sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {folder.name}
      </Typography>
      {folder.unreadCount > 0 && (
        <Box
          component="span"
          sx={{
            px: 0.75,
            py: 0.125,
            fontSize: '0.625rem',
            fontWeight: 600,
            borderRadius: '9999px',
            bgcolor: 'info.light',
            color: 'info.main',
          }}
        >
          {folder.unreadCount}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">{folder.totalCount}</Typography>
    </Box>
  );
}

export function FolderRenderer({
  result,
  status,
}: ToolCallMessagePartProps<
  Record<string, never>,
  FolderResult
>) {
  if (status.type === 'running') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: 'fit-content',
          borderRadius: '10px',
          border: 1,
          borderColor: 'divider',
          bgcolor: 'action.hover',
          p: 1.5,
        }}
      >
        <Folder size={16} color="var(--mui-palette-text-secondary)" />
        <Typography variant="body2" color="text.secondary">Loading folders...</Typography>
      </Box>
    );
  }

  if (status.type === 'incomplete') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50' }}>
        <AlertCircle size={16} color="var(--mui-palette-error-main)" />
        <Typography variant="body2" color="error.main">
          Failed to load folders: {'reason' in status ? (status as { reason?: string }).reason : 'unknown'}
        </Typography>
      </Box>
    );
  }

  if (!result) return null;

  if (result.error) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50' }}>
        <AlertCircle size={16} color="var(--mui-palette-error-main)" />
        <Typography variant="body2" color="error.main">{result.error}</Typography>
      </Box>
    );
  }

  const folders = result.folders ?? [];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" fontWeight={500} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Folders
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {result.count} folder{result.count !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {folders.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No folders found.</Typography>
      ) : (
        <Box>
          {folders.map((f, i) => (
            <FolderRow key={f.id} folder={f} isFirst={i === 0} />
          ))}
        </Box>
      )}
    </Paper>
  );
}

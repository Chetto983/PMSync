import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Users, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import type { CrmResult, CrmContactStat } from '../types';

function ContactStatCard({ contact, isFirst }: { contact: CrmContactStat; isFirst: boolean }) {
  const scorePercent = Math.min(Math.round(contact.relationshipScore), 100);
  const scoreColor =
    scorePercent >= 70 ? 'success.main' : scorePercent >= 40 ? 'warning.main' : 'error.main';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        ...(isFirst ? {} : { borderTop: 1, borderColor: 'divider' }),
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={500}
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {contact.displayName}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
        >
          {contact.email}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 64, height: 6, bgcolor: 'action.hover', borderRadius: '9999px', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', borderRadius: '9999px', bgcolor: scoreColor, width: `${scorePercent}%` }} />
          </Box>
          <Typography variant="caption" fontWeight={500} sx={{ width: 28, textAlign: 'right' }}>
            {scorePercent}%
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, color: 'text.secondary' }}>
          <TrendingUp size={10} />
          <Typography variant="caption">{contact.interactionCount}</Typography>
        </Box>
      </Box>
    </Box>
  );
}

export function CrmRenderer({
  status,
  result,
}: ToolCallMessagePartProps<
  { contactId?: string },
  CrmResult
>) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <Users size={16} />
          <Typography variant="body2">Loading relationship data...</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return (
      <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="body2">{result?.error ?? 'Failed to load CRM data'}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Users size={16} color="var(--mui-palette-primary-main)" />
          <Typography variant="body2" fontWeight={500}>Relationship Stats</Typography>
        </Box>
        {result.averageScore != null && (
          <Typography variant="caption" color="text.secondary">
            Avg: {Math.round(result.averageScore)}%
          </Typography>
        )}
      </Box>

      {result.summary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {result.summary}
        </Typography>
      )}

      <Box>
        {result.contacts.map((c, i) => (
          <ContactStatCard key={c.contactId} contact={c} isFirst={i === 0} />
        ))}
      </Box>

      {result.contacts.some((c) => c.staleDays != null && c.staleDays > 30) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, color: 'warning.main' }}>
          <Clock size={12} />
          <Typography variant="caption">Some contacts may need re-engagement</Typography>
        </Box>
      )}
    </Paper>
  );
}

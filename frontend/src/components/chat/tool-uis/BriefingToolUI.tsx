import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Sun, AlertTriangle, Mail, Star, Clock, CheckSquare, Calendar, MessageCircle } from 'lucide-react';
import { Box, Paper, Typography } from '@mui/material';
import type { BriefingResult } from '../types';

export function BriefingRenderer({
  status,
  result,
}: ToolCallMessagePartProps<
  Record<string, never>,
  BriefingResult
>) {
  if (status.type === 'running') {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, bgcolor: 'action.hover' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          <Sun size={16} />
          <Typography variant="body2">Generating daily briefing...</Typography>
        </Box>
      </Paper>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return (
      <Box sx={{ borderRadius: '8px', border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <AlertTriangle size={16} />
          <Typography variant="body2">{result?.error ?? 'Briefing failed'}</Typography>
        </Box>
      </Box>
    );
  }

  const { stats, summary, followUps, deadlines, actionItems, calendar } = result;

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sun size={16} color="var(--mui-palette-warning-main)" />
          <Typography variant="body2" fontWeight={500}>Daily Briefing</Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'info.light', color: 'info.main', px: 1, py: 0.5, borderRadius: 1 }}>
            <Mail size={12} />
            <Typography variant="caption">{stats.totalUnread} unread</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'error.light', color: 'error.main', px: 1, py: 0.5, borderRadius: 1 }}>
            <Star size={12} />
            <Typography variant="caption">{stats.highPriority} high priority</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'success.light', color: 'success.main', px: 1, py: 0.5, borderRadius: 1 }}>
            <Mail size={12} />
            <Typography variant="caption">{stats.newToday} new</Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary">{summary.summary}</Typography>
          {summary.highlights.length > 0 && (
            <Box component="ul" sx={{ mt: 0.75, pl: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {summary.highlights.map((h, i) => (
                <Box key={i} component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                  <Box component="span" sx={{ color: 'primary.main', mt: 0.25 }}>&#8226;</Box>
                  <Typography variant="caption" color="text.secondary">{h}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
          <MessageCircle size={14} style={{ flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary">
            {followUps.message}
            {followUps.overdue > 0 && (
              <Box component="span" sx={{ color: 'error.main', fontWeight: 500, ml: 0.5 }}>
                ({followUps.overdue} overdue)
              </Box>
            )}
          </Typography>
        </Box>

        {deadlines.count > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Clock size={12} color="var(--mui-palette-warning-main)" />
              <Typography variant="caption" fontWeight={500}>Deadlines ({deadlines.count})</Typography>
            </Box>
            {deadlines.items.map((d, i) => (
              <Typography key={i} variant="caption" color="text.secondary" sx={{ pl: 2.5 }}>
                <Box component="span" fontWeight={500}>{d.title}</Box>
                {d.detail && <Box component="span" sx={{ ml: 0.5 }}>- {d.detail}</Box>}
              </Typography>
            ))}
          </Box>
        )}

        {actionItems.count > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <CheckSquare size={12} color="var(--mui-palette-success-main)" />
              <Typography variant="caption" fontWeight={500}>Action Items ({actionItems.count})</Typography>
            </Box>
            {actionItems.items.map((a, i) => (
              <Typography key={i} variant="caption" color="text.secondary" sx={{ pl: 2.5 }}>
                <Box component="span" fontWeight={500}>{a.title}</Box>
                {a.detail && <Box component="span" sx={{ ml: 0.5 }}>- {a.detail}</Box>}
              </Typography>
            ))}
          </Box>
        )}

        {calendar.hasEvents && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
            <Calendar size={12} color="var(--mui-palette-info-main)" />
            <Typography variant="caption">{calendar.message}</Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}

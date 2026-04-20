import React from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  Mail,
  Ticket,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { UnifiedTask, UnifiedTaskPriority, UnifiedTaskStatus } from '@/lib/api/tasks';

function statusChipColor(status: UnifiedTaskStatus): 'warning' | 'info' | 'success' | 'default' {
  if (status === 'pending') return 'warning';
  if (status === 'in_progress') return 'info';
  if (status === 'completed') return 'success';
  return 'default';
}

function priorityChipColor(priority: UnifiedTaskPriority): 'error' | 'warning' | 'default' {
  if (priority === 'urgent') return 'error';
  if (priority === 'high') return 'warning';
  return 'default';
}

interface TaskDetailDrawerProps {
  task: UnifiedTask | null;
  open: boolean;
  onClose: () => void;
  onComplete: (task: UnifiedTask) => void;
  onDelete: (task: UnifiedTask) => void;
  formatDate: (dateStr: string | null) => string;
  isCompleting?: boolean;
}

export function TaskDetailDrawer({
  task,
  open,
  onClose,
  onComplete,
  onDelete,
  formatDate,
  isCompleting = false,
}: TaskDetailDrawerProps) {
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!task) return null;

  const contextRows = [
    {
      label: t.tasks.filters.sourceType,
      value: t.tasks.sourceTypes[task.sourceType],
      icon: <Ticket size={16} />,
    },
    {
      label: t.tasks.filters.status,
      value: t.tasks.statuses[task.status],
      icon: <CheckSquare size={16} />,
    },
    {
      label: t.tasks.filters.priority,
      value: t.tasks.priorities[task.priority],
      icon: <Clock3 size={16} />,
    },
    {
      label: t.tasks.dialog.dueDateLabel,
      value: formatDate(task.dueDate),
      icon: <CalendarDays size={16} />,
    },
    {
      label: t.tasks.filters.contact,
      value: task.contactName ?? '\u2014',
      icon: <UserRound size={16} />,
    },
    {
      label: t.tasks.workspaceView.updatedLabel,
      value: formatDate(task.updatedAt ?? task.createdAt),
      icon: <Clock3 size={16} />,
    },
  ];

  const relatedRows = [
    { label: 'Email ID', value: task.emailId },
    { label: 'Ticket ID', value: task.ticketId },
    { label: 'Deal ID', value: task.dealId },
    { label: 'Contact ID', value: task.contactId },
  ].filter((row) => row.value);

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 420,
          maxWidth: '100%',
          height: isMobile ? '82vh' : '100%',
          borderTopLeftRadius: isMobile ? 28 : 0,
          borderTopRightRadius: isMobile ? 28 : 0,
          borderBottomLeftRadius: isMobile ? 0 : 28,
          bgcolor: alpha(theme.palette.background.paper, 0.98),
          backgroundImage: 'none',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 2,
            borderBottom: 1,
            borderColor: 'divider',
            background: `linear-gradient(180deg, ${alpha(theme.palette.primary.light, 0.18)} 0%, transparent 100%)`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography
                variant="overline"
                sx={{ color: 'primary.dark', fontWeight: 800, letterSpacing: '0.12em' }}
              >
                {t.tasks.workspaceView.detailEyebrow}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
                {task.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                {task.description || t.tasks.workspaceView.noDescription}
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label={t.common.close}>
              <X size={18} />
            </IconButton>
          </Box>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
            <Chip label={t.tasks.statuses[task.status]} color={statusChipColor(task.status)} />
            <Chip
              label={t.tasks.priorities[task.priority]}
              color={priorityChipColor(task.priority)}
              variant={task.priority === 'low' ? 'outlined' : 'filled'}
            />
            <Chip label={t.tasks.sourceTypes[task.sourceType]} variant="outlined" />
          </Stack>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            {t.tasks.workspaceView.contextTitle}
          </Typography>
          <Stack spacing={1.25}>
            {contextRows.map((row) => (
              <Box
                key={row.label}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 1.5,
                  alignItems: 'start',
                  p: 1.5,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: alpha(theme.palette.background.default, 0.72),
                }}
              >
                <Box sx={{ color: 'text.secondary', mt: 0.25 }}>{row.icon}</Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {row.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
                    {row.value}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            {t.tasks.workspaceView.relatedTitle}
          </Typography>
          {relatedRows.length > 0 ? (
            <Stack spacing={1}>
              {relatedRows.map((row) => (
                <Box
                  key={row.label}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.primary.light, 0.08),
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {row.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {row.value}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : (
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: 1,
                borderStyle: 'dashed',
                borderColor: 'divider',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t.tasks.workspaceView.noRelatedContext}
              </Typography>
            </Box>
          )}

          {task.contactName && (
            <>
              <Divider sx={{ my: 2.5 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                {t.tasks.workspaceView.nextActionTitle}
              </Typography>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.info.light, 0.1),
                  border: 1,
                  borderColor: alpha(theme.palette.info.main, 0.16),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Mail size={16} />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {t.tasks.workspaceView.contactContextTitle}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {t.tasks.workspaceView.contactContextTemplate.replace('{contact}', task.contactName)}
                </Typography>
              </Box>
            </>
          )}
        </Box>

        <Box sx={{ p: 2.5, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1.25}>
            {task.sourceType === 'manual' && (
              <Button
                color="error"
                variant="outlined"
                startIcon={<Trash2 size={16} />}
                onClick={() => onDelete(task)}
              >
                {t.tasks.deleteTask}
              </Button>
            )}
            {task.status !== 'completed' && (
              <Button
                variant="contained"
                startIcon={<CheckSquare size={16} />}
                onClick={() => onComplete(task)}
                disabled={isCompleting}
                sx={{ ml: 'auto' }}
              >
                {t.tasks.completeTask}
              </Button>
            )}
          </Stack>
        </Box>
      </Box>
    </Drawer>
  );
}

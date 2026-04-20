import React from 'react';
import {
  Box,
  Button,
  Chip,
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

  const primarySummary = task.contactName
    ? t.tasks.workspaceView.contactContextTemplate.replace('{contact}', task.contactName)
    : task.description || t.tasks.workspaceView.noDescription;

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      hideBackdrop={!isMobile}
      ModalProps={{
        keepMounted: true,
        slotProps: {
          backdrop: {
            sx: {
              bgcolor: alpha(theme.palette.common.black, 0.22),
              backdropFilter: 'blur(10px)',
            },
          },
        },
      }}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 480,
          maxWidth: isMobile ? '100%' : 'calc(100vw - 32px)',
          height: isMobile ? '82vh' : 'calc(100% - 104px)',
          top: isMobile ? 'auto' : 88,
          right: isMobile ? 0 : 16,
          borderRadius: isMobile ? '28px 28px 0 0' : 6,
          border: 1,
          borderColor: alpha(theme.palette.common.black, 0.08),
          boxShadow: isMobile
            ? `0 -12px 36px ${alpha(theme.palette.common.black, 0.18)}`
            : `0 28px 64px ${alpha(theme.palette.common.black, 0.16)}`,
          bgcolor: theme.palette.background.paper,
          backgroundImage: 'none',
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box
          sx={{
            px: 3,
            pt: 2.25,
            pb: 1.75,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.default, 0.72),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}
              >
                {t.tasks.workspaceView.detailEyebrow}
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.75, fontWeight: 800, lineHeight: 1.25 }}>
                {task.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.9, maxWidth: 420 }}>
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

        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.25 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 3,
              border: 1,
              borderColor: alpha(theme.palette.primary.main, 0.16),
              bgcolor: alpha(theme.palette.primary.light, 0.07),
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.9 }}>
              <Mail size={16} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {t.tasks.workspaceView.nextActionTitle}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              {primarySummary}
            </Typography>
          </Box>

          <Box sx={{ mt: 2.25 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.25 }}>
              {t.tasks.workspaceView.contextTitle}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 1,
              }}
            >
              {contextRows.map((row) => (
                <Box
                  key={row.label}
                  sx={{
                    p: 1.4,
                    borderRadius: 2.5,
                    border: 1,
                    borderColor: alpha(theme.palette.divider, 0.9),
                    bgcolor: alpha(theme.palette.background.default, 0.46),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                    {row.icon}
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      {row.label}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{ mt: 0.8, fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {row.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box sx={{ mt: 2.5, pt: 2.25, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.25 }}>
              {t.tasks.workspaceView.relatedTitle}
            </Typography>
            {relatedRows.length > 0 ? (
              <Stack spacing={0}>
                {relatedRows.map((row, index) => (
                  <Box
                    key={row.label}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      py: 1.35,
                      borderTop: index === 0 ? 1 : 0,
                      borderBottom: 1,
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {row.label}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        textAlign: 'right',
                      }}
                    >
                      {row.value}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Box
                sx={{
                  p: 1.6,
                  borderRadius: 2.5,
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
          </Box>
        </Box>

        <Box sx={{ p: 2.25, borderTop: 1, borderColor: 'divider', bgcolor: alpha(theme.palette.background.default, 0.7) }}>
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
                size="large"
                startIcon={<CheckSquare size={16} />}
                onClick={() => onComplete(task)}
                disabled={isCompleting}
                sx={{ ml: 'auto', minWidth: { sm: 180 } }}
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

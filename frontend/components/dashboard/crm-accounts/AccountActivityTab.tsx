/**
 * AccountActivityTab — shows activity timeline for an account.
 * Reuses same MUI Timeline pattern as DealTimeline.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Plus } from 'lucide-react';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from '@mui/lab';
import {
  ArrowRightLeft,
  StickyNote,
  Mail,
  Phone,
  Users,
  ListTodo,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useAccountActivities,
  useCreateAccountActivity,
} from '@/hooks/queries/use-crm-accounts';
import type { AccountActivity } from '@/lib/api/crm-accounts';
import { useGlobalToast } from '@/lib/context/toast-context';

const ACTIVITY_ICON_MAP: Record<string, React.ReactNode> = {
  STAGE_CHANGE: <ArrowRightLeft size={16} />,
  NOTE: <StickyNote size={16} />,
  EMAIL: <Mail size={16} />,
  CALL: <Phone size={16} />,
  MEETING: <Users size={16} />,
  TASK: <ListTodo size={16} />,
};

const ACTIVITY_COLOR_MAP: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error'> = {
  STAGE_CHANGE: 'info',
  NOTE: 'secondary',
  EMAIL: 'primary',
  CALL: 'success',
  MEETING: 'warning',
  TASK: 'error',
};

const ACTIVITY_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TASK'] as const;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Create Activity Dialog ----

function CreateAccountActivityDialog({
  open,
  onClose,
  accountId,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
}) {
  const t = useTranslations();
  const tf = t.crmAccounts?.detail?.activity?.form;
  const tt = t.crmAccounts?.detail?.activity?.types;
  const toast = useGlobalToast();
  const createActivity = useCreateAccountActivity(accountId);

  const [type, setType] = useState<string>('CALL');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');

  const resetForm = () => {
    setType('CALL');
    setDescription('');
    setDate('');
    setDurationMinutes('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = async () => {
    try {
      await createActivity.mutateAsync({
        type: type as 'CALL' | 'EMAIL' | 'MEETING' | 'TASK',
        description: description || undefined,
        date: date || undefined,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      });
      toast.success(tf?.created ?? 'Activity logged');
      handleClose();
    } catch {
      toast.error(tf?.createError ?? 'Failed to log activity');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{tf?.title ?? 'Log Activity'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label={tf?.type ?? 'Activity Type'}
            value={type}
            onChange={(e) => setType(e.target.value)}
            select
            fullWidth
            size="small"
          >
            {ACTIVITY_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {tt?.[t] ?? t}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label={tf?.description ?? 'Description'}
            placeholder={tf?.descriptionPlaceholder ?? 'What happened?'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={3}
          />

          <TextField
            label={tf?.date ?? 'Date & Time'}
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label={tf?.duration ?? 'Duration (minutes)'}
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ htmlInput: { min: 0 } }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={createActivity.isPending}>
          {tf?.cancel ?? 'Cancel'}
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={createActivity.isPending}
          startIcon={createActivity.isPending ? <CircularProgress size={16} /> : undefined}
        >
          {tf?.save ?? 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Activity Item ----

function ActivityItem({
  activity,
  typeLabels,
  isLast,
}: {
  activity: AccountActivity;
  typeLabels: Record<string, string | undefined> | undefined;
  isLast: boolean;
}) {
  const typeLabel = typeLabels?.[activity.type] ?? activity.type;

  return (
    <TimelineItem>
      <TimelineOppositeContent
        sx={{ flex: 0.25, py: 1.5, px: 1 }}
        variant="caption"
        color="text.secondary"
      >
        {formatDateTime(activity.createdAt)}
      </TimelineOppositeContent>
      <TimelineSeparator>
        <TimelineDot color={ACTIVITY_COLOR_MAP[activity.type] ?? 'grey'} variant="outlined">
          {ACTIVITY_ICON_MAP[activity.type] ?? <StickyNote size={16} />}
        </TimelineDot>
        {!isLast && <TimelineConnector />}
      </TimelineSeparator>
      <TimelineContent sx={{ py: 1.5, px: 2 }}>
        <Typography variant="subtitle2" component="span">
          {typeLabel}
        </Typography>
        {activity.content && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {activity.content}
          </Typography>
        )}
        {activity.metadata && typeof (activity.metadata as Record<string, unknown>).durationMinutes === 'number' && (
          <Typography variant="caption" color="text.disabled">
            {String((activity.metadata as Record<string, unknown>).durationMinutes)} min
          </Typography>
        )}
      </TimelineContent>
    </TimelineItem>
  );
}

// ---- Main Component ----

const PAGE_SIZE = 10;

export function AccountActivityTab({ accountId }: { accountId: string }) {
  const t = useTranslations();
  const ta = t.crmAccounts?.detail?.activity;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<AccountActivity[]>([]);

  const { data, isLoading, isFetching, isError } = useAccountActivities(accountId, {
    limit: PAGE_SIZE,
    offset,
  });

  // Reset pagination when accountId changes
  useEffect(() => {
    setOffset(0);
    setAccumulated([]);
  }, [accountId]);

  // Append new page data when it arrives
  useEffect(() => {
    if (!data) return;
    if (offset === 0) {
      setAccumulated(data.data);
    } else {
      setAccumulated((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newItems = data.data.filter((a) => !existingIds.has(a.id));
        return [...prev, ...newItems];
      });
    }
  }, [data, offset]);

  const total = data?.total ?? 0;
  const hasMore = accumulated.length < total;
  const loadingMore = isFetching && offset > 0;

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE);
  }, []);

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 2 }} />
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Skeleton variant="circular" width={32} height={32} />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="30%" height={20} />
              <Skeleton width="60%" height={16} />
            </Box>
          </Box>
        ))}
      </Paper>
    );
  }

  if (isError) {
    return <Alert severity="error">{t.common.genericError}</Alert>;
  }

  if (accumulated.length === 0) {
    return (
      <>
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary">
            {ta?.empty ?? 'No activity yet'}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
            {ta?.emptyDescription ?? 'Activities for this account will appear here.'}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={() => setDialogOpen(true)}
          >
            {ta?.addActivity ?? 'Log Activity'}
          </Button>
        </Paper>
        <CreateAccountActivityDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          accountId={accountId}
        />
      </>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {ta?.title ?? 'Activity Timeline'}
        </Typography>
        <Button
          size="small"
          startIcon={<Plus size={16} />}
          onClick={() => setDialogOpen(true)}
        >
          {ta?.addActivity ?? 'Log Activity'}
        </Button>
      </Box>
      <Timeline sx={{ p: 0, m: 0 }}>
        {accumulated.map((activity, idx) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            typeLabels={ta?.types}
            isLast={idx === accumulated.length - 1}
          />
        ))}
      </Timeline>
      {hasMore && (
        <Box sx={{ textAlign: 'center', mt: 1 }}>
          <Button
            size="small"
            variant="text"
            onClick={handleLoadMore}
            disabled={loadingMore}
            startIcon={loadingMore ? <CircularProgress size={16} /> : undefined}
          >
            {ta?.loadMore ?? 'Load more'}
          </Button>
        </Box>
      )}
      <CreateAccountActivityDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        accountId={accountId}
      />
    </Paper>
  );
}

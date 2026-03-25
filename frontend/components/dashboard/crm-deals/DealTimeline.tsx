import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
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
import { useDealActivities } from '@/hooks/queries/use-crm-deals';
import type { CrmActivity } from '@/lib/api/crm-deals';
import { CreateActivityDialog } from './CreateActivityDialog';

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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActivityItem({
  activity,
  typeLabels,
  isLast,
}: {
  activity: CrmActivity;
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

export function DealTimeline({ dealId }: { dealId: string }) {
  const t = useTranslations();
  const tl = t.crmDeals?.detail?.timeline;
  const { data, isLoading } = useDealActivities(dealId);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const activities = data?.data ?? [];

  if (activities.length === 0) {
    return (
      <>
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary">
            {tl?.empty ?? 'No activity yet'}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
            {tl?.emptyDescription ?? 'Activities and stage changes will appear here.'}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={() => setDialogOpen(true)}
          >
            {tl?.addActivity ?? 'Log Activity'}
          </Button>
        </Paper>
        <CreateActivityDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          dealId={dealId}
        />
      </>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {tl?.title ?? 'Activity Timeline'}
        </Typography>
        <Button
          size="small"
          startIcon={<Plus size={16} />}
          onClick={() => setDialogOpen(true)}
        >
          {tl?.addActivity ?? 'Log Activity'}
        </Button>
      </Box>
      <Timeline sx={{ p: 0, m: 0 }}>
        {activities.map((activity, idx) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            typeLabels={tl?.types}
            isLast={idx === activities.length - 1}
          />
        ))}
      </Timeline>
      {data && data.total > activities.length && (
        <Box sx={{ textAlign: 'center', mt: 1 }}>
          <Button size="small" variant="text">
            {tl?.loadMore ?? 'Load more'}
          </Button>
        </Box>
      )}
      <CreateActivityDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        dealId={dealId}
      />
    </Paper>
  );
}

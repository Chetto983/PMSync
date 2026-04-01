import { memo, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  CircularProgress,
} from '@mui/material';
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
  Mail,
  MailOpen,
  Users,
  ArrowRightLeft,
  Ticket,
  StickyNote,
  Phone,
  ListTodo,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';

// ---- Types ----

export type ActivityEventType =
  | 'email_sent'
  | 'email_received'
  | 'meeting'
  | 'deal_stage_change'
  | 'ticket_update'
  | 'note'
  | 'call'
  | 'task'
  | 'stage_change'
  | 'EMAIL'
  | 'CALL'
  | 'MEETING'
  | 'TASK'
  | 'NOTE'
  | 'STAGE_CHANGE';

export interface ActivityEvent {
  id: string;
  type: string;
  content: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityTimelineProps {
  activities: ActivityEvent[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

// ---- Icon + Color Maps ----

const EVENT_ICON: Record<string, React.ReactNode> = {
  email_sent: <Mail size={14} />,
  email_received: <MailOpen size={14} />,
  meeting: <Users size={14} />,
  deal_stage_change: <ArrowRightLeft size={14} />,
  stage_change: <ArrowRightLeft size={14} />,
  ticket_update: <Ticket size={14} />,
  note: <StickyNote size={14} />,
  call: <Phone size={14} />,
  task: <ListTodo size={14} />,
  EMAIL: <Mail size={14} />,
  CALL: <Phone size={14} />,
  MEETING: <Users size={14} />,
  TASK: <ListTodo size={14} />,
  NOTE: <StickyNote size={14} />,
  STAGE_CHANGE: <ArrowRightLeft size={14} />,
};

const EVENT_COLOR: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error'> = {
  email_sent: 'primary',
  email_received: 'primary',
  meeting: 'warning',
  deal_stage_change: 'info',
  stage_change: 'info',
  ticket_update: 'error',
  note: 'secondary',
  call: 'success',
  task: 'error',
  EMAIL: 'primary',
  CALL: 'success',
  MEETING: 'warning',
  TASK: 'error',
  NOTE: 'secondary',
  STAGE_CHANGE: 'info',
};

// ---- Helpers ----

function formatActivityDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale || 'en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEventTypeLabel(
  type: string,
  eventTypes?: Record<string, string | undefined>,
): string {
  const key = type.toLowerCase() as keyof typeof eventTypes;
  const label = eventTypes?.[key];
  if (label) return label;
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Skeleton ----

const TimelineSkeleton = memo(function TimelineSkeleton() {
  return (
    <Box sx={{ py: 1 }}>
      {[1, 2, 3].map((i) => (
        <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
          <Skeleton variant="circular" width={28} height={28} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="70%" />
          </Box>
          <Skeleton variant="text" width={60} />
        </Box>
      ))}
    </Box>
  );
});

// ---- Single Item ----

interface TimelineEventItemProps {
  event: ActivityEvent;
  isLast: boolean;
  locale: string;
  eventTypes?: Record<string, string | undefined>;
}

const TimelineEventItem = memo(function TimelineEventItem({
  event,
  isLast,
  locale,
  eventTypes,
}: TimelineEventItemProps) {
  const icon = EVENT_ICON[event.type] ?? <StickyNote size={14} />;
  const color = EVENT_COLOR[event.type] ?? 'grey';

  return (
    <TimelineItem>
      <TimelineOppositeContent
        sx={{ flex: 0.25, minWidth: 70, maxWidth: 100, py: 1.5, px: 0.5 }}
      >
        <Typography variant="caption" color="text.secondary" noWrap>
          {formatActivityDate(event.createdAt, locale)}
        </Typography>
      </TimelineOppositeContent>
      <TimelineSeparator>
        <TimelineDot color={color} variant="outlined" sx={{ p: 0.5, my: 0.5 }}>
          {icon}
        </TimelineDot>
        {!isLast && <TimelineConnector />}
      </TimelineSeparator>
      <TimelineContent sx={{ py: 1.5, px: 1.5 }}>
        <Typography variant="body2" fontWeight={500}>
          {getEventTypeLabel(event.type, eventTypes)}
        </Typography>
        {event.content && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {event.content}
          </Typography>
        )}
      </TimelineContent>
    </TimelineItem>
  );
});

// ---- Main Component ----

export const ActivityTimeline = memo(function ActivityTimeline({
  activities,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: ActivityTimelineProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const ta = t.activityTimeline;

  const eventTypes = useMemo(
    () => ta?.eventTypes as Record<string, string | undefined> | undefined,
    [ta],
  );

  const handleLoadMore = useCallback(() => {
    onLoadMore?.();
  }, [onLoadMore]);

  if (isLoading) {
    return <TimelineSkeleton />;
  }

  if (!activities.length) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {ta?.noActivities ?? 'No activities yet'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Timeline
        sx={{
          px: 0,
          py: 0,
          '& .MuiTimelineItem-root:before': { display: 'none' },
        }}
      >
        {activities.map((event, index) => (
          <TimelineEventItem
            key={event.id}
            event={event}
            isLast={index === activities.length - 1 && !hasMore}
            locale={locale}
            eventTypes={eventTypes}
          />
        ))}
      </Timeline>

      {hasMore && onLoadMore && (
        <Box sx={{ textAlign: 'center', py: 1 }}>
          <Button
            size="small"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            startIcon={isLoadingMore ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {isLoadingMore ? (ta?.loading ?? 'Loading...') : (ta?.loadMore ?? 'Load more')}
          </Button>
        </Box>
      )}
    </Box>
  );
});

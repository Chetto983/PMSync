import React from 'react';
import { Tabs, Tab, Badge, useTheme } from '@mui/material';
import {
  Zap,
  Clock,
  Star,
  Bell,
  Archive,
  Inbox,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLaneCounts } from '@/hooks/queries/use-lane-counts';

export type LaneValue =
  | 'all'
  | 'action-now'
  | 'waiting-on-reply'
  | 'customer-vip'
  | 'system-alerts'
  | 'review-later';

interface LaneTabBarProps {
  value: LaneValue;
  onChange: (lane: LaneValue) => void;
}

interface LaneDef {
  value: LaneValue;
  labelKey: keyof ReturnType<typeof useTranslationsHelper>;
  icon: React.ReactElement;
  color: string;
}

function useTranslationsHelper() {
  const t = useTranslations();
  return t.ai.triage.lanes;
}

export function LaneTabBar({ value, onChange }: LaneTabBarProps) {
  const t = useTranslations();
  const theme = useTheme();
  const { data: counts } = useLaneCounts();
  const lanes = t.ai.triage.lanes;

  const laneDefs: LaneDef[] = [
    { value: 'all', labelKey: 'all', icon: <Inbox size={16} />, color: theme.palette.text.primary },
    { value: 'action-now', labelKey: 'actionNow', icon: <Zap size={16} />, color: theme.palette.error.main },
    { value: 'waiting-on-reply', labelKey: 'waitingOnReply', icon: <Clock size={16} />, color: theme.palette.warning.main },
    { value: 'customer-vip', labelKey: 'customerVip', icon: <Star size={16} />, color: theme.palette.primary.main },
    { value: 'system-alerts', labelKey: 'systemAlerts', icon: <Bell size={16} />, color: theme.palette.info.main },
    { value: 'review-later', labelKey: 'reviewLater', icon: <Archive size={16} />, color: theme.palette.text.secondary },
  ];

  const getCount = (lane: LaneValue): number | undefined => {
    if (!counts || lane === 'all') return undefined;
    return counts[lane] || undefined;
  };

  return (
    <Tabs
      value={value}
      onChange={(_, newValue: LaneValue) => onChange(newValue)}
      variant="scrollable"
      scrollButtons="auto"
      sx={{
        minHeight: 40,
        borderBottom: 1,
        borderColor: 'divider',
        '& .MuiTab-root': {
          minHeight: 40,
          py: 0.5,
          px: 1.5,
          textTransform: 'none',
          fontSize: '0.8125rem',
        },
      }}
    >
      {laneDefs.map((lane) => {
        const count = getCount(lane.value);
        const label = lanes[lane.labelKey];

        return (
          <Tab
            key={lane.value}
            value={lane.value}
            icon={lane.icon}
            iconPosition="start"
            label={
              count != null ? (
                <Badge
                  badgeContent={count}
                  color="default"
                  max={999}
                  sx={{
                    '& .MuiBadge-badge': {
                      position: 'static',
                      transform: 'none',
                      ml: 0.75,
                      minWidth: 18,
                      height: 18,
                      fontSize: '0.7rem',
                      bgcolor: lane.color,
                      color: theme.palette.getContrastText(lane.color),
                    },
                  }}
                >
                  {label}
                </Badge>
              ) : (
                label
              )
            }
            sx={{
              color: value === lane.value ? lane.color : 'text.secondary',
              '&.Mui-selected': { color: lane.color },
            }}
          />
        );
      })}
    </Tabs>
  );
}

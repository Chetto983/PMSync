/**
 * CalendarHeader - Header with navigation, view toggle, and refresh
 *
 * Features:
 * - Month/year display
 * - Navigation (prev/next/today)
 * - View toggle (day/week/month/list)
 * - Refresh button with sync indicator
 * - Mobile hamburger menu
 * - Matches dashboard UI/UX patterns
 *
 * @see https://fullcalendar.io/docs
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import { ChevronLeft, ChevronRight, RefreshCw, Menu } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// ============================================================================
// TYPES
// ============================================================================

export type CalendarViewType = 'day' | 'week' | 'month' | 'list';

interface CalendarHeaderProps {
  /** Current month display name */
  currentMonth: string;
  /** Current year display */
  currentYear: string;
  /** Current view type */
  viewType: CalendarViewType;
  /** Handler for view type change */
  onViewTypeChange: (view: CalendarViewType) => void;
  /** Handler for previous navigation */
  onPrev: () => void;
  /** Handler for next navigation */
  onNext: () => void;
  /** Handler for today navigation */
  onToday: () => void;
  /** Handler for refresh/sync */
  onRefresh: () => void;
  /** Whether loading */
  isLoading: boolean;
  /** Whether syncing */
  isSyncing: boolean;
  /** Handler for opening mobile drawer */
  onOpenMobileDrawer: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CalendarHeader({
  currentMonth,
  currentYear,
  viewType,
  onViewTypeChange,
  onPrev,
  onNext,
  onToday,
  onRefresh,
  isLoading,
  isSyncing,
  onOpenMobileDrawer,
}: CalendarHeaderProps) {
  const theme = useTheme();
  const t = useTranslations();
  const calendarCopy = t.calendar;

  return (
    <Box
      sx={{
        px: { xs: 2, md: 3 },
        py: 2,
        borderBottom: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Mobile hamburger menu */}
      <Tooltip title={calendarCopy.openSidebar}>
        <IconButton
          size="small"
          onClick={onOpenMobileDrawer}
          aria-label={calendarCopy.openSidebar}
          sx={{
            display: { xs: 'flex', md: 'none' },
            color: 'text.primary',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.1),
            },
          }}
        >
          <Menu size={20} />
        </IconButton>
      </Tooltip>

      {/* Month/Year Title */}
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          color: 'text.primary',
          minWidth: 'fit-content',
        }}
      >
        {currentMonth} {currentYear}
      </Typography>

      {/* Navigation Buttons */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Tooltip title={calendarCopy.previousPeriod}>
          <IconButton
            size="small"
            onClick={onPrev}
            aria-label={calendarCopy.previousPeriod}
            sx={{
              color: 'text.secondary',
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
              },
            }}
          >
            <ChevronLeft size={20} />
          </IconButton>
        </Tooltip>
        <Tooltip title={calendarCopy.nextPeriod}>
          <IconButton
            size="small"
            onClick={onNext}
            aria-label={calendarCopy.nextPeriod}
            sx={{
              color: 'text.secondary',
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
              },
            }}
          >
            <ChevronRight size={20} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Today Button */}
      <Button
        variant="outlined"
        size="small"
        onClick={onToday}
        sx={{
          borderRadius: 2,
          textTransform: 'none',
          fontWeight: 600,
          borderColor: alpha(theme.palette.divider, 0.2),
          '&:hover': {
            borderColor: theme.palette.primary.main,
            bgcolor: alpha(theme.palette.primary.main, 0.04),
          },
        }}
      >
        {calendarCopy.today}
      </Button>

      {/* Refresh Button */}
      <Tooltip title={calendarCopy.refreshTooltip}>
        <IconButton
          size="small"
          onClick={onRefresh}
          disabled={isLoading || isSyncing}
          sx={{
            color: 'text.secondary',
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: 'primary.main',
            },
          }}
        >
          <RefreshCw
            size={18}
            style={{
              animation: isLoading || isSyncing ? 'spin 1s linear infinite' : 'none',
            }}
          />
        </IconButton>
      </Tooltip>

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* View Toggle */}
      <ToggleButtonGroup
        value={viewType}
        exclusive
        onChange={(_, newView) => newView && onViewTypeChange(newView)}
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            textTransform: 'none',
            fontWeight: 500,
            px: { xs: 1.5, md: 2 },
            borderRadius: 2,
            borderColor: alpha(theme.palette.divider, 0.2),
            '&.Mui-selected': {
              bgcolor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              fontWeight: 600,
              '&:hover': {
                bgcolor: theme.palette.primary.dark,
              },
            },
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.08),
            },
          },
        }}
      >
        <ToggleButton value="day">{calendarCopy.day}</ToggleButton>
        <ToggleButton value="week">{calendarCopy.week}</ToggleButton>
        <ToggleButton value="month">{calendarCopy.month}</ToggleButton>
        <ToggleButton value="list">{calendarCopy.list}</ToggleButton>
      </ToggleButtonGroup>

      {/* CSS for spin animation */}
      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Box>
  );
}

export default CalendarHeader;

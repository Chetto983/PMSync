/**
 * QuickActionsBar - Fast access to common actions
 *
 * 2025 Pattern: Keyboard-first, instant actions like Superhuman
 */

'use client';

import { Box, Button, alpha, useTheme, Tooltip } from '@mui/material';
import {
  PenSquare,
  Calendar,
  Search,
  Sparkles,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useRouter } from 'next/router';

interface QuickAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  href?: string;
  onClick?: () => void;
}

interface QuickActionsBarProps {
  onRefreshAll?: () => void;
  onOpenSettings?: () => void;
}

export function QuickActionsBar({ onRefreshAll, onOpenSettings }: QuickActionsBarProps) {
  const t = useTranslations();
  const theme = useTheme();
  const router = useRouter();

  const actions: QuickAction[] = [
    {
      id: 'compose',
      icon: <PenSquare size={18} />,
      label: t.email.composer.title,
      shortcut: 'C',
      href: '/dashboard/email?compose=true',
    },
    {
      id: 'search',
      icon: <Search size={18} />,
      label: t.common.search,
      shortcut: '/',
      href: '/dashboard/email?search=true',
    },
    {
      id: 'calendar',
      icon: <Calendar size={18} />,
      label: t.calendar.title,
      shortcut: 'G C',
      href: '/dashboard/calendar',
    },
    {
      id: 'ai',
      icon: <Sparkles size={18} />,
      label: t.ai.title,
      shortcut: 'G A',
      href: '/dashboard/ai',
    },
    {
      id: 'refresh',
      icon: <RefreshCw size={18} />,
      label: t.common.refresh,
      shortcut: 'R',
      onClick: onRefreshAll,
    },
    {
      id: 'settings',
      icon: <Settings size={18} />,
      label: t.settings.title,
      shortcut: 'G S',
      onClick: onOpenSettings,
    },
  ];

  const handleAction = (action: QuickAction) => {
    if (action.onClick) {
      action.onClick();
    } else if (action.href) {
      router.push(action.href);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        flexWrap: 'wrap',
        p: 1.5,
        borderRadius: 3,
        bgcolor: alpha(theme.palette.background.paper, 0.6),
        backdropFilter: 'blur(10px)',
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.1),
      }}
    >
      {actions.map((action) => (
        <Tooltip
          key={action.id}
          title={
            action.shortcut
              ? `${action.label} (${action.shortcut})`
              : action.label
          }
          arrow
          placement="bottom"
        >
          <Button
            size="small"
            variant="text"
            onClick={() => handleAction(action)}
            sx={{
              minWidth: 'auto',
              px: 1.5,
              py: 1,
              borderRadius: 2,
              gap: 1,
              color: 'text.secondary',
              fontSize: '0.8125rem',
              fontWeight: 500,
              textTransform: 'none',
              '&:hover': {
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                color: 'primary.main',
              },
            }}
          >
            {action.icon}
            <Box
              component="span"
              sx={{ display: { xs: 'none', sm: 'inline' } }}
            >
              {action.label}
            </Box>
            {action.shortcut && (
              <Box
                component="kbd"
                sx={{
                  display: { xs: 'none', md: 'inline-flex' },
                  px: 0.75,
                  py: 0.25,
                  ml: 0.5,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.action.active, 0.08),
                  fontSize: '0.6875rem',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: 'text.disabled',
                }}
              >
                {action.shortcut}
              </Box>
            )}
          </Button>
        </Tooltip>
      ))}
    </Box>
  );
}

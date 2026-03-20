/**
 * BaseWidget - Reusable base component for all dashboard widgets
 *
 * Features:
 * - Modern header with gradient icon
 * - Loading skeleton
 * - Error state
 * - Empty state
 * - Refresh button
 */

import { ReactNode, useState, useMemo } from 'react';
import {
  Box,
  Button,
  Collapse,
  IconButton,
  Skeleton,
  Typography,
  alpha,
  useTheme,
  Chip,
} from '@mui/material';
import { RefreshCw, Inbox, ChevronDown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface BaseWidgetProps {
  /** Unique widget ID */
  id: string;

  /** Widget title */
  title: string;

  /** Widget subtitle */
  subtitle?: string;

  /** Widget content */
  children: ReactNode;

  /** Loading state */
  loading?: boolean;

  /** Error message */
  error?: string;

  /** Refresh handler */
  onRefresh?: () => void;

  /** Optional right-side header actions */
  actions?: ReactNode;

  /** Badge count */
  badge?: number;

  /** Icon component */
  icon?: ReactNode;

  /** Empty state text */
  emptyText?: string;

  /** Whether the widget has no data */
  isEmpty?: boolean;

  /** Raw error object from TanStack Query -- extracts code + requestId for collapsible details */
  rawError?: unknown;
}

export function BaseWidget({
  id: _id,
  title,
  subtitle,
  children,
  loading = false,
  error,
  onRefresh,
  actions,
  badge,
  icon,
  emptyText,
  isEmpty = false,
  rawError,
}: BaseWidgetProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Extract structured error details from raw Axios error (Phase 33: PERF-04)
  const errorDetails = useMemo(() => {
    if (!rawError) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axiosError = rawError as any;
    const code = axiosError?.response?.data?.error?.code as string | undefined;
    const requestId = axiosError?.response?.data?.meta?.requestId as string | undefined;
    if (!code && !requestId) return undefined;
    return { code, requestId };
  }, [rawError]);

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        p: 3,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          mb: 2.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {icon && (
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
                flexShrink: 0,
              }}
            >
              {icon}
            </Box>
          )}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography
                variant="h6"
                sx={{
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'text.primary',
                  lineHeight: 1.3,
                }}
              >
                {title}
              </Typography>
              {badge !== undefined && badge > 0 && (
                <Chip
                  label={badge}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    bgcolor: alpha(theme.palette.primary.main, 0.15),
                    color: 'primary.main',
                    '& .MuiChip-label': { px: 1 },
                  }}
                />
              )}
            </Box>
            {subtitle && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: '0.8rem', mt: 0.25 }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        {(actions || onRefresh) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {actions}
            {onRefresh && (
              <IconButton
                size="small"
                onClick={onRefresh}
                disabled={loading}
                aria-label={t.dashboard.widgets.common.refreshWidget}
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: alpha(theme.palette.action.active, 0.06),
                  '&:hover': {
                    bgcolor: alpha(theme.palette.action.active, 0.12),
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    ...(loading && {
                      '@keyframes spin': {
                        from: { transform: 'rotate(0deg)' },
                        to: { transform: 'rotate(360deg)' },
                      },
                      animation: 'spin 1s linear infinite',
                    }),
                  }}
                >
                  <RefreshCw size={16} />
                </Box>
              </IconButton>
            )}
          </Box>
        )}
      </Box>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 4,
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha(theme.palette.text.secondary, 0.1),
            borderRadius: 2,
          },
        }}
      >
        {loading ? (
          <WidgetSkeleton />
        ) : error ? (
          <Box
            sx={{
              borderRadius: 2,
              bgcolor: alpha(theme.palette.error.main, 0.06),
              border: `1px solid ${alpha(theme.palette.error.main, 0.15)}`,
              p: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mb: onRefresh || errorDetails ? 1.5 : 0 }}>
              {error}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {onRefresh && (
                <Button
                  size="small"
                  startIcon={<RefreshCw size={14} />}
                  onClick={onRefresh}
                  sx={{ textTransform: 'none', fontSize: '0.8rem' }}
                >
                  {t.dashboard.widgets.common.retry}
                </Button>
              )}
              {errorDetails && (
                <Button
                  size="small"
                  variant="text"
                  endIcon={
                    <ChevronDown
                      size={14}
                      style={{
                        transform: detailsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                    />
                  }
                  onClick={() => setDetailsOpen((prev) => !prev)}
                  sx={{ textTransform: 'none', fontSize: '0.75rem', color: 'text.disabled' }}
                >
                  {t.dashboard.widgets.common.showDetails}
                </Button>
              )}
            </Box>
            {errorDetails && (
              <Collapse in={detailsOpen}>
                <Box
                  sx={{
                    mt: 1,
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: alpha(theme.palette.error.main, 0.04),
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    lineHeight: 1.8,
                  }}
                >
                  {errorDetails.code && <div>Error code: {errorDetails.code}</div>}
                  {errorDetails.requestId && <div>Request ID: {errorDetails.requestId}</div>}
                </Box>
              </Collapse>
            )}
          </Box>
        ) : isEmpty ? (
          <EmptyState text={emptyText} defaultText={t.dashboard.widgets.common.noItems} />
        ) : (
          children
        )}
      </Box>
    </Box>
  );
}

/**
 * Loading skeleton for widgets
 */
function WidgetSkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {[1, 2, 3].map((i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Skeleton variant="circular" width={36} height={36} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="70%" height={18} sx={{ mb: 0.5 }} />
            <Skeleton width="50%" height={14} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Empty state component
 */
function EmptyState({ text, defaultText }: { text?: string; defaultText: string }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
        color: 'text.disabled',
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.action.active, 0.06),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 1.5,
        }}
      >
        <Inbox size={24} />
      </Box>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        {text || defaultText}
      </Typography>
    </Box>
  );
}

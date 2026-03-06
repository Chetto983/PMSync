/**
 * DashboardContainer - Main dashboard with modern 2025 design
 *
 * Features:
 * - Clean 2-column responsive grid
 * - Glassmorphism card styling
 * - Full-width briefing at top
 * - 2x2 grid for smaller widgets
 * - Personalization drawer
 */

'use client';

import React, { Suspense, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  alpha,
  useTheme,
  useMediaQuery,
  Button,
  Stack,
} from '@mui/material';
import { LayoutDashboard, Settings } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { ALL_WIDGETS } from '@/stores/dashboard-store';
import { WIDGETS, type WidgetId } from './dashboard/widget-registry';
import { WidgetSkeleton } from './dashboard/WidgetSkeleton';
import { WidgetCard } from './dashboard/WidgetCard';
import { CustomizeDrawer } from './dashboard/CustomizeDrawer';
import { DashboardEmptyState } from './dashboard/DashboardEmptyState';
import { AiQuickAccess } from './dashboard/AiQuickAccess';

export default function DashboardContainer() {
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Customization state - show all widgets by default (backend controls via API)
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(ALL_WIDGETS as WidgetId[]);

  const handleToggleWidget = useCallback((id: WidgetId) => {
    setVisibleWidgets((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  }, []);

  const handleResetWidgets = useCallback(() => {
    setVisibleWidgets(ALL_WIDGETS as WidgetId[]);
  }, []);

  // Get visible widgets in order
  const widgetsToShow = WIDGETS.filter((w) => visibleWidgets.includes(w.id));
  const briefingWidget = widgetsToShow.find((w) => w.id === 'briefing');
  const otherWidgets = widgetsToShow.filter((w) => w.id !== 'briefing');

  return (
    <Box
      sx={{
        maxWidth: 1400,
        mx: 'auto',
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, md: 4 },
        width: '100%',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: { xs: 3, md: 4 },
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          <Box
            sx={{
              width: { xs: 52, md: 64 },
              height: { xs: 52, md: 64 },
              borderRadius: 4,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.35)}`,
              flexShrink: 0,
            }}
          >
            <LayoutDashboard size={isMobile ? 26 : 32} color="white" />
          </Box>
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                fontSize: { xs: '1.75rem', md: '2.25rem' },
                background: `linear-gradient(135deg, ${theme.palette.text.primary} 0%, ${alpha(theme.palette.text.primary, 0.7)} 100%)`,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t.dashboard?.title || 'Dashboard'}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t.dashboard?.subtitle || 'Your personal command center'}
            </Typography>
          </Box>
        </Box>

        <Button
          variant="outlined"
          startIcon={<Settings size={18} />}
          onClick={() => setCustomizeOpen(true)}
          sx={{
            borderRadius: 3,
            px: 3,
            py: 1,
            textTransform: 'none',
            fontWeight: 600,
            borderWidth: 2,
            '&:hover': {
              borderWidth: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.05),
            },
          }}
        >
          {t.dashboard?.actions?.customize || 'Customize'}
        </Button>
      </Box>

      {/* Widgets Grid */}
      {widgetsToShow.length > 0 ? (
        <Stack spacing={3}>
          {/* Briefing Widget - Full Width */}
          {briefingWidget && (
            <WidgetCard fullWidth>
              <Suspense fallback={<WidgetSkeleton />}>
                <briefingWidget.component />
              </Suspense>
            </WidgetCard>
          )}

          {/* Other Widgets - 2-column grid */}
          {otherWidgets.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                },
                gap: 3,
              }}
            >
              {otherWidgets.map((widget) => (
                <WidgetCard key={widget.id}>
                  <Suspense fallback={<WidgetSkeleton />}>
                    <widget.component />
                  </Suspense>
                </WidgetCard>
              ))}
            </Box>
          )}

          {/* AI Assistant Quick Access */}
          <AiQuickAccess />
        </Stack>
      ) : (
        <DashboardEmptyState onCustomize={() => setCustomizeOpen(true)} />
      )}

      {/* Customize Drawer */}
      <CustomizeDrawer
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        visibleWidgets={visibleWidgets}
        onToggleWidget={handleToggleWidget}
        onReset={handleResetWidgets}
      />
    </Box>
  );
}

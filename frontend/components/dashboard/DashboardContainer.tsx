/**
 * DashboardContainer - Main dashboard with unified Card variant="outlined" design
 */

'use client';

import React, { Suspense, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Stack,
} from '@mui/material';
import { Settings } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PageContainer } from '@/components/common';
import { ALL_WIDGETS } from '@/stores/dashboard-store';
import { useDashboardPreferences, useSaveDashboardLayout } from '@/hooks/queries/use-dashboard';
import { WIDGETS, type WidgetId } from './dashboard/widget-registry';
import { WidgetSkeleton } from './dashboard/WidgetSkeleton';
import { WidgetCard } from './dashboard/WidgetCard';
import { CustomizeDrawer } from './dashboard/CustomizeDrawer';
import { DashboardEmptyState } from './dashboard/DashboardEmptyState';
import { AiQuickAccess } from './dashboard/AiQuickAccess';

export default function DashboardContainer() {
  const t = useTranslations();

  // Customization state - persisted via backend preferences API
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { data: preferences } = useDashboardPreferences();
  const saveMutation = useSaveDashboardLayout();

  const visibleWidgets = useMemo(() => {
    if (!preferences?.widgets?.length) return ALL_WIDGETS as WidgetId[];
    return preferences.widgets
      .map((w) => w.widgetId as WidgetId)
      .filter((id) => (ALL_WIDGETS as readonly string[]).includes(id));
  }, [preferences]);

  const buildLayout = useCallback((widgetIds: WidgetId[]) => {
    return widgetIds.map((widgetId, i) => ({
      i: `${widgetId}-1`,
      widgetId,
      x: (i % 2) * 6,
      y: Math.floor(i / 2) * 4,
      w: widgetId === 'briefing' ? 12 : 6,
      h: 4,
    }));
  }, []);

  const handleToggleWidget = useCallback((id: WidgetId) => {
    const newVisible = visibleWidgets.includes(id)
      ? visibleWidgets.filter((w) => w !== id)
      : [...visibleWidgets, id];
    saveMutation.mutate(buildLayout(newVisible));
  }, [visibleWidgets, saveMutation, buildLayout]);

  const handleResetWidgets = useCallback(() => {
    saveMutation.mutate(buildLayout(ALL_WIDGETS as WidgetId[]));
  }, [saveMutation, buildLayout]);

  // Get visible widgets in order
  const widgetsToShow = WIDGETS.filter((w) => visibleWidgets.includes(w.id));
  const briefingWidget = widgetsToShow.find((w) => w.id === 'briefing');
  const otherWidgets = widgetsToShow.filter((w) => w.id !== 'briefing');

  const headerActions = (
    <Button
      variant="outlined"
      size="small"
      startIcon={<Settings size={16} />}
      onClick={() => setCustomizeOpen(true)}
      sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
    >
      {t.dashboard?.actions?.customize || 'Customize'}
    </Button>
  );

  return (
    <PageContainer
      title={t.dashboard?.title || 'Dashboard'}
      subtitle={t.dashboard?.subtitle || 'Your personal command center'}
      actions={headerActions}
    >
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
    </PageContainer>
  );
}

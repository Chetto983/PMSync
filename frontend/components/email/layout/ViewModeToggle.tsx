'use client';

/**
 * View Mode Toggle Component
 *
 * Toggle button group for switching between list and Kanban views.
 * Reads/writes viewMode from email-ui-store (persisted to localStorage).
 */

import React from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { List, Columns } from 'lucide-react';
import { useEmailUIStore, type EmailViewMode } from '@/stores/email-ui-store';
import { useTranslations } from '@/lib/hooks/use-translations';

export function ViewModeToggle() {
  const viewMode = useEmailUIStore((s) => s.viewMode);
  const setViewMode = useEmailUIStore((s) => s.setViewMode);
  const t = useTranslations();

  // When in thread view, treat as list for the toggle display
  const displayMode = viewMode === 'thread' ? 'list' : viewMode;

  const handleChange = (_event: React.MouseEvent<HTMLElement>, value: EmailViewMode | null) => {
    if (value && value !== 'thread') {
      setViewMode(value);
    }
  };

  return (
    <ToggleButtonGroup
      value={displayMode}
      exclusive
      onChange={handleChange}
      size="small"
      aria-label="view mode"
      sx={{
        '& .MuiToggleButton-root': {
          px: 1,
          py: 0.5,
          border: 1,
          borderColor: 'divider',
          '&.Mui-selected': {
            bgcolor: 'action.selected',
          },
        },
      }}
    >
      <Tooltip title={t.email?.viewMode?.list || 'List view'}>
        <ToggleButton value="list" aria-label="List view">
          <List size={18} />
        </ToggleButton>
      </Tooltip>
      <Tooltip title={t.email?.viewMode?.kanban || 'Kanban view'}>
        <ToggleButton value="kanban" aria-label="Kanban view">
          <Columns size={18} />
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
  );
}

export default ViewModeToggle;

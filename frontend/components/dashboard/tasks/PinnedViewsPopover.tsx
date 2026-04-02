import React, { useMemo } from 'react';
import {
  Popover,
  Box,
  Typography,
  Divider,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useSmartViews } from '@/hooks/queries/use-tasks';
import { useGlobalToast } from '@/lib/context/toast-context';

interface PinnedViewsPopoverProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

export function PinnedViewsPopover({ anchorEl, open, onClose }: PinnedViewsPopoverProps) {
  const t = useTranslations();
  const tv = t.tasks.smartViews;
  const toast = useGlobalToast();
  const router = useRouter();
  const { data: views } = useSmartViews();

  const pinnedViews = useMemo(
    () =>
      (views ?? [])
        .filter((v) => v.isPinned)
        .sort((a, b) => a.pinOrder - b.pinOrder),
    [views],
  );

  return (
    <Popover
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
      transformOrigin={{ vertical: 'center', horizontal: 'left' }}
    >
      <Box sx={{ width: 220, maxHeight: 280, overflowY: 'auto', p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {tv.pinnedViews}
        </Typography>
        <Divider sx={{ my: 1 }} />

        {pinnedViews.length === 0 ? (
          <>
            <Typography variant="body2" color="text.secondary">
              {tv.noPinnedViews}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tv.noPinnedViewsHint}
            </Typography>
          </>
        ) : (
          <List disablePadding>
            {pinnedViews.map((view) => (
              <ListItemButton
                key={view.id}
                onClick={() => {
                  void router.push(`/dashboard/tasks?view=${view.id}`);
                  toast.success(tv.applied);
                  onClose();
                }}
              >
                <ListItemText
                  primary={view.name}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Popover>
  );
}

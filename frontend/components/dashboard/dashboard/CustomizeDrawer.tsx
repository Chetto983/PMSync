/**
 * CustomizeDrawer - Dashboard widget customization drawer
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  alpha,
  useTheme,
  Button,
  Drawer,
  IconButton,
  Switch,
  Stack,
} from '@mui/material';
import { Settings, X, RotateCcw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  WIDGETS,
  getWidgetName,
  getWidgetDescription,
  type WidgetId,
} from './widget-registry';

interface CustomizeDrawerProps {
  open: boolean;
  onClose: () => void;
  visibleWidgets: WidgetId[];
  onToggleWidget: (id: WidgetId) => void;
  onReset: () => void;
}

export function CustomizeDrawer({
  open,
  onClose,
  visibleWidgets,
  onToggleWidget,
  onReset,
}: CustomizeDrawerProps) {
  const t = useTranslations();
  const theme = useTheme();

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 380 },
          bgcolor: 'background.default',
          borderTopLeftRadius: { sm: 16 },
          borderBottomLeftRadius: { sm: 16 },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.1),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
            }}
          >
            <Settings size={18} />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {t.dashboard?.actions?.customize || 'Customize'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.dashboard?.customize?.description || 'Choose your widgets'}
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            bgcolor: alpha(theme.palette.action.active, 0.08),
            '&:hover': { bgcolor: alpha(theme.palette.action.active, 0.15) },
          }}
        >
          <X size={20} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
        <Stack spacing={2}>
          {WIDGETS.map((widget) => {
            const isVisible = visibleWidgets.includes(widget.id);
            return (
              <Paper
                key={widget.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderColor: isVisible
                    ? theme.palette.primary.main
                    : 'divider',
                  bgcolor: isVisible
                    ? alpha(theme.palette.primary.main, 0.04)
                    : 'background.paper',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: isVisible
                      ? theme.palette.primary.main
                      : alpha(theme.palette.primary.main, 0.5),
                  },
                }}
                onClick={() => onToggleWidget(widget.id)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor: isVisible
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.action.active, 0.06),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isVisible ? 'primary.main' : 'text.secondary',
                    }}
                  >
                    {widget.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {getWidgetName(widget.id, t)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {getWidgetDescription(widget.id)}
                    </Typography>
                  </Box>
                  <Switch
                    checked={isVisible}
                    color="primary"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleWidget(widget.id)}
                  />
                </Box>
              </Paper>
            );
          })}
        </Stack>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          p: 3,
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.1),
          display: 'flex',
          gap: 2,
        }}
      >
        <Button
          variant="outlined"
          startIcon={<RotateCcw size={18} />}
          onClick={onReset}
          sx={{ borderRadius: 2, flex: 1, textTransform: 'none' }}
        >
          {t.dashboard?.actions?.reset || 'Reset'}
        </Button>
        <Button
          variant="contained"
          onClick={onClose}
          sx={{ borderRadius: 2, flex: 1, textTransform: 'none' }}
        >
          {t.common?.done || 'Done'}
        </Button>
      </Box>
    </Drawer>
  );
}

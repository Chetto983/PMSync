/**
 * CalendarSidebar - Sidebar with calendar list, quick event, and AI insights
 *
 * Features:
 * - Quick event input with keyboard support
 * - Calendar list grouped by provider (accordion)
 * - Color picker for calendar customization
 * - AI insights panel
 * - Matches dashboard and email UI/UX patterns with glassmorphism
 *
 * @see https://fullcalendar.io/docs
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  Checkbox,
  CircularProgress,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  alpha,
  useTheme,
} from '@mui/material';
import { Plus, Sparkles, ChevronDown, Palette, Trash2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { CalendarColorPicker } from './CalendarColorPicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CalendarPreference {
  id: string; // providerId:calendarId
  calendarId: string;
  calendarName: string;
  providerId: string;
  providerEmail: string;
  providerType: string;
  color: string;
  enabled: boolean;
  primary?: boolean;
  removable?: boolean;
}

export interface ProviderGroup {
  providerId: string;
  providerEmail: string;
  providerType: string;
  calendars: CalendarPreference[];
  expanded: boolean;
}

interface CalendarSidebarProps {
  /** Quick event input text */
  quickEventText: string;
  /** Handler for quick event text change */
  onQuickEventTextChange: (text: string) => void;
  /** Handler for quick event creation */
  onQuickEvent: () => void;
  /** Handler for opening create event dialog */
  onOpenEventDialog: () => void;
  /** Handler for creating a new calendar */
  onCreateCalendar: (data: {
    providerId: string;
    name: string;
    description?: string;
    color?: string;
  }) => Promise<void>;
  /** Handler for deleting a calendar */
  onDeleteCalendar: (providerId: string, calendarId: string) => Promise<void>;
  /** Provider groups with calendars */
  providerGroups: ProviderGroup[];
  /** Calendar preferences map */
  calendarPrefs: Map<string, CalendarPreference>;
  /** Handler for toggling calendar visibility */
  onToggleCalendar: (calendarKey: string) => void;
  /** Handler for toggling provider expansion */
  onToggleProviderExpanded: (providerId: string) => void;
  /** Handler for color selection */
  onColorSelect: (calendarId: string, providerId: string, color: string) => void;
  /** Color picker anchor element */
  colorPickerAnchor: HTMLElement | null;
  /** Currently editing calendar ID for color picker */
  colorPickerCalendarId: string | null;
  /** Handler for opening color picker */
  onOpenColorPicker: (event: React.MouseEvent<HTMLElement>, calendarId: string) => void;
  /** Handler for closing color picker */
  onCloseColorPicker: () => void;
  /** Total event count */
  eventCount: number;
  /** Loading state */
  isLoading: boolean;
  /** Close mobile drawer callback (optional) */
  onCloseMobileDrawer?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CalendarSidebar({
  quickEventText,
  onQuickEventTextChange,
  onQuickEvent,
  onOpenEventDialog,
  onCreateCalendar,
  onDeleteCalendar,
  providerGroups,
  calendarPrefs,
  onToggleCalendar,
  onToggleProviderExpanded,
  onColorSelect,
  colorPickerAnchor,
  colorPickerCalendarId,
  onOpenColorPicker,
  onCloseColorPicker,
  eventCount,
  isLoading,
  onCloseMobileDrawer,
}: CalendarSidebarProps) {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslations();
  const calendarCopy = t.calendar;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false);
  const [isDeletingCalendar, setIsDeletingCalendar] = useState(false);
  const [calendarName, setCalendarName] = useState('');
  const [calendarDescription, setCalendarDescription] = useState('');
  const [calendarColor, setCalendarColor] = useState('#0B7EFF');
  const [calendarProviderId, setCalendarProviderId] = useState('');
  const [calendarFormError, setCalendarFormError] = useState('');
  const [calendarToDelete, setCalendarToDelete] = useState<CalendarPreference | null>(null);

  const providerOptions = useMemo(
    () =>
      providerGroups.map((group) => ({
        providerId: group.providerId,
        providerEmail: group.providerEmail,
        providerType: group.providerType,
      })),
    [providerGroups]
  );

  // Handle color selection from picker
  const handleColorSelect = useCallback(
    (color: string) => {
      if (colorPickerCalendarId) {
        const pref = calendarPrefs.get(colorPickerCalendarId);
        if (pref) {
          onColorSelect(pref.calendarId, pref.providerId, color);
        }
      }
    },
    [colorPickerCalendarId, calendarPrefs, onColorSelect]
  );

  // Handle opening event dialog with mobile drawer close
  const handleOpenEventDialog = useCallback(() => {
    onOpenEventDialog();
    onCloseMobileDrawer?.();
  }, [onOpenEventDialog, onCloseMobileDrawer]);

  const handleOpenCreateCalendarDialog = useCallback(() => {
    setCalendarProviderId(providerOptions[0]?.providerId ?? '');
    setCalendarName('');
    setCalendarDescription('');
    setCalendarColor('#0B7EFF');
    setCalendarFormError('');
    setCreateDialogOpen(true);
    onCloseMobileDrawer?.();
  }, [onCloseMobileDrawer, providerOptions]);

  const handleCreateCalendar = useCallback(async () => {
    if (!calendarName.trim()) {
      setCalendarFormError(calendarCopy.calendarNameRequired);
      return;
    }

    if (!calendarProviderId) {
      setCalendarFormError(calendarCopy.providerRequired);
      return;
    }

    setIsCreatingCalendar(true);
    try {
      await onCreateCalendar({
        providerId: calendarProviderId,
        name: calendarName.trim(),
        description: calendarDescription.trim() || undefined,
        color: calendarColor,
      });
      setCreateDialogOpen(false);
    } finally {
      setIsCreatingCalendar(false);
    }
  }, [
    calendarColor,
    calendarCopy.calendarNameRequired,
    calendarCopy.providerRequired,
    calendarDescription,
    calendarName,
    calendarProviderId,
    onCreateCalendar,
  ]);

  const handleConfirmDeleteCalendar = useCallback(async () => {
    if (!calendarToDelete) {
      return;
    }

    setIsDeletingCalendar(true);
    try {
      await onDeleteCalendar(calendarToDelete.providerId, calendarToDelete.calendarId);
      setCalendarToDelete(null);
    } finally {
      setIsDeletingCalendar(false);
    }
  }, [calendarToDelete, onDeleteCalendar]);

  return (
    <>
      {/* Quick Event Input */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={calendarCopy.quickEventPlaceholder}
          value={quickEventText}
          onChange={(e) => onQuickEventTextChange(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && onQuickEvent()}
          sx={{
            mb: 1.5,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                bgcolor: alpha(theme.palette.background.paper, 0.95),
              },
              '&.Mui-focused': {
                bgcolor: theme.palette.background.paper,
              },
            },
          }}
        />
        <Stack spacing={1}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={handleOpenEventDialog}
            sx={{
              minHeight: 48,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.95rem',
              boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.3)}`,
              '&:hover': {
                boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.4)}`,
              },
            }}
          >
            {calendarCopy.createEvent}
          </Button>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={handleOpenCreateCalendarDialog}
            disabled={providerOptions.length === 0}
            sx={{
              minHeight: 42,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            {calendarCopy.createCalendarAction}
          </Button>
        </Stack>
      </Box>

      {/* Calendars - Grouped by Provider */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
        {calendarCopy.filterTitle}
      </Typography>
      <Box
        sx={{
          mb: 2,
          overflow: 'auto',
          flex: 1,
          borderRadius: 3,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
          bgcolor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(10px)',
          p: 1,
          scrollbarWidth: 'thin',
          scrollbarColor: `${alpha(theme.palette.text.secondary, 0.3)} transparent`,
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha(theme.palette.text.secondary, 0.3),
            borderRadius: '3px',
            '&:hover': { bgcolor: alpha(theme.palette.text.secondary, 0.5) },
          },
        }}
      >
        {providerGroups.map((group) => (
          <Accordion
            key={group.providerId}
            expanded={group.expanded}
            onChange={() => onToggleProviderExpanded(group.providerId)}
            disableGutters
            elevation={0}
            sx={{
              '&:before': { display: 'none' },
              bgcolor: 'transparent',
            }}
          >
            <AccordionSummary
              expandIcon={<ChevronDown size={16} />}
              sx={{
                minHeight: 40,
                px: 1,
                borderRadius: 2,
                '& .MuiAccordionSummary-content': { my: 0.5 },
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {group.providerEmail}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, px: 0.5 }}>
              <List disablePadding>
                {group.calendars.map((cal) => (
                  <ListItem
                    key={cal.id}
                    disablePadding
                    sx={{
                      mb: 0.25,
                      px: 0.5,
                      py: 0.375,
                      borderRadius: 1.5,
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={cal.enabled}
                        onChange={() => onToggleCalendar(cal.id)}
                        sx={{
                          color: cal.color,
                          '&.Mui-checked': { color: cal.color },
                          p: 0.5,
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.8125rem',
                            fontWeight: cal.enabled ? 500 : 400,
                            color: cal.enabled ? 'text.primary' : 'text.secondary',
                            lineHeight: 1.35,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cal.calendarName}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.25,
                          flexShrink: 0,
                          ml: 'auto',
                        }}
                      >
                        <Tooltip title={calendarCopy.colorPicker?.title || 'Change color'}>
                          <IconButton
                            size="small"
                            onClick={(e) => onOpenColorPicker(e, cal.id)}
                            sx={{
                              p: 0.5,
                              color: 'text.secondary',
                              '&:hover': {
                                bgcolor: alpha(theme.palette.primary.main, 0.1),
                                color: 'primary.main',
                              },
                            }}
                          >
                            <Palette size={14} />
                          </IconButton>
                        </Tooltip>
                        {cal.removable !== false && (
                          <Tooltip title={calendarCopy.deleteCalendarAction}>
                            <IconButton
                              size="small"
                              onClick={() => setCalendarToDelete(cal)}
                              sx={{
                                p: 0.5,
                                color: 'text.secondary',
                                '&:hover': {
                                  bgcolor: alpha(theme.palette.error.main, 0.1),
                                  color: 'error.main',
                                },
                              }}
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        ))}
        {providerGroups.length === 0 && !isLoading && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', p: 1.5, textAlign: 'center' }}>
            {calendarCopy.noProviders}
          </Typography>
        )}
      </Box>

      {/* AI Assistant - Only show if there are events */}
      {eventCount > 5 && (
        <Box
          sx={{
            mt: 'auto',
            p: 2.5,
            borderRadius: 3,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.9)} 0%, ${alpha(theme.palette.secondary.main, 0.9)} 100%)`,
            backdropFilter: 'blur(10px)',
            border: '1px solid',
            borderColor: alpha(theme.palette.common.white, 0.2),
            boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.3)}`,
            color: 'white',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Sparkles size={20} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {calendarCopy.aiInsightsTitle}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ fontSize: '0.8rem', mb: 2, opacity: 0.9, lineHeight: 1.5 }}>
            {calendarCopy.aiOptimizeMessage.replace('{count}', eventCount.toString())}
          </Typography>
          <Button
            size="small"
            variant="contained"
            sx={{
              bgcolor: alpha(theme.palette.common.white, 0.95),
              color: theme.palette.primary.main,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: 2,
              px: 2,
              '&:hover': {
                bgcolor: theme.palette.common.white,
                boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.15)}`,
              },
            }}
            onClick={() => router.push('/dashboard/ai')}
          >
            {calendarCopy.openAiAssistant}
          </Button>
        </Box>
      )}

      {/* No events message */}
      {eventCount === 0 && !isLoading && (
        <Box
          sx={{
            mt: 'auto',
            p: 2,
            borderRadius: 3,
            bgcolor: alpha(theme.palette.background.paper, 0.6),
            backdropFilter: 'blur(10px)',
            border: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.08),
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', textAlign: 'center' }}>
            {calendarCopy.noEventsMessage}
          </Typography>
        </Box>
      )}

      {/* Calendar Color Picker */}
      <CalendarColorPicker
        selectedColor={
          colorPickerCalendarId ? calendarPrefs.get(colorPickerCalendarId)?.color || '#0B7EFF' : '#0B7EFF'
        }
        onColorSelect={handleColorSelect}
        onClose={onCloseColorPicker}
        anchorEl={colorPickerAnchor}
      />

      <Dialog
        open={createDialogOpen}
        onClose={() => !isCreatingCalendar && setCreateDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{calendarCopy.createCalendarDialogTitle}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              select
              fullWidth
              label={calendarCopy.providerLabel}
              value={calendarProviderId}
              onChange={(event) => {
                setCalendarProviderId(event.target.value);
                setCalendarFormError('');
              }}
            >
              {providerOptions.map((provider) => (
                <MenuItem key={provider.providerId} value={provider.providerId}>
                  {provider.providerEmail}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label={calendarCopy.calendarNameLabel}
              value={calendarName}
              onChange={(event) => {
                setCalendarName(event.target.value);
                setCalendarFormError('');
              }}
              error={!!calendarFormError}
              helperText={calendarFormError || ' '}
            />
            <TextField
              fullWidth
              label={calendarCopy.calendarDescriptionLabel}
              value={calendarDescription}
              onChange={(event) => setCalendarDescription(event.target.value)}
              multiline
              minRows={3}
            />
            <TextField
              fullWidth
              type="color"
              label={calendarCopy.calendarColorLabel}
              value={calendarColor}
              onChange={(event) => setCalendarColor(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={isCreatingCalendar} color="inherit">
            {calendarCopy.cancelEvent}
          </Button>
          <Button
            onClick={handleCreateCalendar}
            disabled={isCreatingCalendar || providerOptions.length === 0}
            variant="contained"
            startIcon={
              isCreatingCalendar ? <CircularProgress size={16} color="inherit" /> : <Plus size={16} />
            }
          >
            {calendarCopy.createCalendarAction}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!calendarToDelete}
        onClose={() => setCalendarToDelete(null)}
        onConfirm={handleConfirmDeleteCalendar}
        title={calendarCopy.deleteCalendarAction}
        message={
          calendarToDelete
            ? calendarCopy.deleteCalendarConfirm.replace('{name}', calendarToDelete.calendarName)
            : ''
        }
        confirmText={calendarCopy.deleteCalendarAction}
        cancelText={calendarCopy.cancelEvent}
        isLoading={isDeletingCalendar}
        variant="danger"
      />
    </>
  );
}

export default CalendarSidebar;

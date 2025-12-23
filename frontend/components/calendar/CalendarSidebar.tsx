/**
 * CalendarSidebar - Sidebar with calendar list, quick event, and AI insights
 *
 * Features:
 * - Quick event input with keyboard support
 * - Calendar list grouped by provider (accordion)
 * - Color picker for calendar customization
 * - AI insights panel
 * - Glassmorphism styling
 *
 * @see https://fullcalendar.io/docs
 */

import React, { useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  IconButton,
  TextField,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { Plus, Sparkles, ChevronDown, Palette } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { CalendarColorPicker } from './CalendarColorPicker';

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
// GLASSMORPHISM STYLES
// ============================================================================

const glassStyles = {
  container: {
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRight: '1px solid rgba(255, 255, 255, 0.3)',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.5)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
  },
  aiPanel: {
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.9) 0%, rgba(139, 92, 246, 0.9) 100%)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CalendarSidebar({
  quickEventText,
  onQuickEventTextChange,
  onQuickEvent,
  onOpenEventDialog,
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
  const t = useTranslations();
  const calendarCopy = t.calendar;

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
            mb: 1,
            '& .MuiOutlinedInput-root': {
              ...glassStyles.card,
              borderRadius: 2,
            },
          }}
        />
        <Button
          fullWidth
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={handleOpenEventDialog}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
          }}
        >
          {calendarCopy.createEvent}
        </Button>
      </Box>

      {/* Calendars - Grouped by Provider */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {calendarCopy.filterTitle}
      </Typography>
      <Box
        sx={{
          mb: 2,
          overflow: 'auto',
          flex: 1,
          ...glassStyles.card,
          borderRadius: 2,
          p: 1,
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
                minHeight: 36,
                px: 1,
                '& .MuiAccordionSummary-content': { my: 0.5 },
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                {group.providerEmail}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, px: 1 }}>
              <List disablePadding>
                {group.calendars.map((cal) => (
                  <ListItem
                    key={cal.id}
                    disablePadding
                    sx={{
                      mb: 0.25,
                      borderRadius: 1,
                      transition: 'background-color 0.2s ease',
                      '&:hover': {
                        bgcolor: 'rgba(99, 102, 241, 0.08)',
                      },
                    }}
                    secondaryAction={
                      <Tooltip title={calendarCopy.colorPicker?.title || 'Change color'}>
                        <IconButton
                          size="small"
                          onClick={(e) => onOpenColorPicker(e, cal.id)}
                          sx={{ p: 0.5 }}
                        >
                          <Palette size={14} />
                        </IconButton>
                      </Tooltip>
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Checkbox
                        size="small"
                        checked={cal.enabled}
                        onChange={() => onToggleCalendar(cal.id)}
                        sx={{
                          color: cal.color,
                          '&.Mui-checked': { color: cal.color },
                          p: 0.5,
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={cal.calendarName}
                      primaryTypographyProps={{ fontSize: '0.8125rem', noWrap: true }}
                    />
                  </ListItem>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        ))}
        {providerGroups.length === 0 && !isLoading && (
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', p: 1 }}>
            {calendarCopy.noProviders}
          </Typography>
        )}
      </Box>

      {/* AI Assistant - Only show if there are events */}
      {eventCount > 5 && (
        <Box
          sx={{
            mt: 'auto',
            p: 2,
            borderRadius: 3,
            ...glassStyles.aiPanel,
            color: 'white',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Sparkles size={20} />
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {calendarCopy.aiInsightsTitle}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ fontSize: '0.75rem', mb: 1.5, opacity: 0.9 }}>
            {calendarCopy.aiOptimizeMessage.replace('{count}', eventCount.toString())}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                color: 'primary.main',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': { bgcolor: 'white' },
              }}
              onClick={() => router.push('/dashboard/ai')}
            >
              {calendarCopy.openAiAssistant}
            </Button>
          </Box>
        </Box>
      )}

      {/* No events message */}
      {eventCount === 0 && !isLoading && (
        <Box
          sx={{
            mt: 'auto',
            p: 2,
            borderRadius: 3,
            ...glassStyles.card,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
    </>
  );
}

export default CalendarSidebar;

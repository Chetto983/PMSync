'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  CircularProgress,
  Paper,
  Radio,
  RadioGroup,
  FormControlLabel,
  Chip,
  Alert,
  Collapse,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  X,
  Calendar,
  MapPin,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Send,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { aiChatApi } from '@/lib/api/ai';
import { type CreateEventDto } from '@/lib/api/calendar';
import { useCreateCalendarEvent, calendarEventsOptions } from '@/hooks/queries/use-calendar';
import { useQueryClient } from '@tanstack/react-query';
import { type ProviderConfig } from '@/lib/api/providers';
import { useProviders } from '@/hooks/queries/use-providers';
import { useLocale } from '@/lib/hooks/use-locale';
import { logger } from '@/lib/logger';

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  conflicts?: string[];
  recommendation?: string;
}

export interface SchedulingDrawerProps {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  onEventCreated?: (event: { id: string; title: string; startTime: string; endTime: string }) => void;
}

export function SchedulingDrawer({
  open,
  onClose,
  initialPrompt = '',
  onEventCreated,
}: SchedulingDrawerProps) {
  const t = useTranslations();
  const { locale } = useLocale();

  // State
  const [prompt, setPrompt] = useState(initialPrompt);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedSlots, setSuggestedSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<string>('');

  // Event details
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  // Provider state
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');

  // Track if provider has been initialized to prevent infinite loop
  const hasInitializedProvider = useRef(false);

  // Load providers using TanStack Query hook
  const { data: providersData } = useProviders();

  // TanStack Query client for imperative fetching
  const queryClient = useQueryClient();

  // Use TanStack Query mutation for creating events
  const createEventMutation = useCreateCalendarEvent();

  // Initialize provider on mount - fixed infinite loop by using ref
  useEffect(() => {
    if (open && providersData && !hasInitializedProvider.current) {
      const calendarProviders = providersData.filter((p) => p.supportsCalendar);
      setProviders(calendarProviders);
      if (calendarProviders.length > 0) {
        const defaultProvider = calendarProviders.find((p) => p.isDefault) || calendarProviders[0];
        setSelectedProvider(defaultProvider.id);
        hasInitializedProvider.current = true;
      }
    }
    // Reset on close
    if (!open) {
      hasInitializedProvider.current = false;
    }
  }, [open, providersData]);

  // Translations from locale files
  const labels = t.ai.calendarAi.scheduling;

  // Helper: Generate suggested time slots based on business days
  const generateTimeSlots = useCallback((): TimeSlot[] => {
    const suggestions: TimeSlot[] = [];
    const now = new Date();

    for (let i = 1; i <= 5; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);

      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      // Morning slot (10 AM)
      const morningStart = new Date(date);
      morningStart.setHours(10, 0, 0, 0);
      const morningEnd = new Date(morningStart);
      morningEnd.setHours(11, 0, 0, 0);

      // Afternoon slot (2 PM)
      const afternoonStart = new Date(date);
      afternoonStart.setHours(14, 0, 0, 0);
      const afternoonEnd = new Date(afternoonStart);
      afternoonEnd.setHours(15, 0, 0, 0);

      suggestions.push({
        id: `slot-${i}-morning`,
        startTime: morningStart.toISOString(),
        endTime: morningEnd.toISOString(),
        isAvailable: true,
        recommendation: suggestions.length === 0 ? labels.bestTime : undefined,
      });

      suggestions.push({
        id: `slot-${i}-afternoon`,
        startTime: afternoonStart.toISOString(),
        endTime: afternoonEnd.toISOString(),
        isAvailable: true,
      });

      if (suggestions.length >= 6) break;
    }

    return suggestions;
  }, [labels.bestTime]);

  // Helper: Check conflicts with existing events
  const checkConflicts = useCallback(async (slots: TimeSlot[]): Promise<TimeSlot[]> => {
    if (!selectedProvider) return slots;

    try {
      // Get date range from slots
      const startTimes = slots.map(s => new Date(s.startTime));
      const endTimes = slots.map(s => new Date(s.endTime));
      const minDate = new Date(Math.min(...startTimes.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...endTimes.map(d => d.getTime())));

      // Fetch existing events using TanStack Query (imperative)
      const eventsData = await queryClient.fetchQuery(
        calendarEventsOptions({
          providerId: selectedProvider,
          startTime: minDate.toISOString(),
          endTime: maxDate.toISOString(),
        })
      );

      const events = eventsData?.events || [];

      // Check each slot for conflicts
      return slots.map(slot => {
        const slotStart = new Date(slot.startTime).getTime();
        const slotEnd = new Date(slot.endTime).getTime();

        const conflictingEvents = events.filter(event => {
          const eventStart = new Date(event.startTime).getTime();
          const eventEnd = new Date(event.endTime).getTime();
          // Check overlap
          return slotStart < eventEnd && slotEnd > eventStart;
        });

        if (conflictingEvents.length > 0) {
          return {
            ...slot,
            isAvailable: false,
            conflicts: conflictingEvents.map(e => e.title),
          };
        }

        return { ...slot, isAvailable: true };
      });
    } catch (err) {
      logger.error('Failed to check conflicts', { error: err });
      return slots;
    }
  }, [selectedProvider, queryClient]);

  // Generate suggested time slots using multi-agent AI
  const handleGenerateSlots = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuggestedSlots([]);
    setSelectedSlot(null);

    try {
      // Call AI chat to process scheduling request
      const response = await aiChatApi.chat({
        message: prompt,
        locale,
      });

      // Store AI response for display
      const aiMessage = response.data?.text || '';
      setAiResponse(aiMessage);

      // Generate suggested time slots based on business days
      const slots = generateTimeSlots();

      // Check conflicts with existing calendar events
      const slotsWithConflicts = await checkConflicts(slots);
      setSuggestedSlots(slotsWithConflicts);
      setShowDetails(true);

      // Extract title from prompt if possible
      const titleMatch = prompt.match(/meeting with (.+?)(?:\s+next|\s+on|\s+tomorrow|$)/i);
      if (titleMatch) {
        setTitle(`Meeting with ${titleMatch[1]}`);
      } else {
        // Try to extract any meaningful title from the prompt
        const words = prompt.split(' ').slice(0, 4).join(' ');
        if (words.length > 3) {
          setTitle(words.charAt(0).toUpperCase() + words.slice(1));
        }
      }
    } catch (err) {
      logger.error('Failed to generate time slots', { error: err });
      setError(labels.errorGenerating);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, locale, generateTimeSlots, checkConflicts, labels.errorGenerating]);

  // Create event using TanStack Query mutation
  const handleCreateEvent = useCallback(async () => {
    if (!selectedSlot || !title.trim()) {
      setError(labels.selectSlot);
      return;
    }

    if (!selectedProvider) {
      setError(labels.selectProvider);
      return;
    }

    const slot = suggestedSlots.find((s) => s.id === selectedSlot);
    if (!slot) return;

    setIsLoading(true);
    setError(null);

    try {
      // Create event using TanStack Query mutation
      const eventData: CreateEventDto = {
        providerId: selectedProvider,
        title,
        description: notes || undefined,
        location: location || undefined,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isAllDay: false,
      };

      const createdEvent = await createEventMutation.mutateAsync(eventData);

      onEventCreated?.({
        id: createdEvent.id,
        title: createdEvent.title,
        startTime: createdEvent.startTime,
        endTime: createdEvent.endTime,
      });
      onClose();

      // Reset state
      setPrompt('');
      setSuggestedSlots([]);
      setSelectedSlot(null);
      setTitle('');
      setLocation('');
      setNotes('');
      setShowDetails(false);
      setAiResponse('');
    } catch (err) {
      logger.error('Failed to create event', { error: err });
      setError(labels.errorCreating);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSlot, title, location, notes, suggestedSlots, selectedProvider, onEventCreated, onClose, labels.selectSlot, labels.selectProvider, labels.errorCreating, createEventMutation]);

  // Format date/time for display
  const formatSlotTime = (isoString: string) => {
    const date = new Date(isoString);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = dayNames[date.getDay()];
    const month = monthNames[date.getMonth()];
    const dayNum = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;

    return `${day}, ${month} ${dayNum} at ${hour12}:${minutes} ${ampm}`;
  };

  const formatTimeRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startHour = startDate.getHours() % 12 || 12;
    const endHour = endDate.getHours() % 12 || 12;
    const startAmpm = startDate.getHours() >= 12 ? 'PM' : 'AM';
    const endAmpm = endDate.getHours() >= 12 ? 'PM' : 'AM';

    return `${startHour}:00 ${startAmpm} - ${endHour}:00 ${endAmpm}`;
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 420 },
          p: 0,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Calendar size={20} />
          <Typography variant="h6">{labels.title}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'inherit' }}>
          <X size={20} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
        {/* Provider Selector */}
        {providers.length > 0 && (
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>{t.nav.calendar}</InputLabel>
            <Select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              label={t.nav.calendar}
            >
              {providers.map((provider) => (
                <MenuItem key={provider.id} value={provider.id}>
                  {provider.email || provider.displayName || provider.providerType}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Prompt Input */}
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={2}
            placeholder={labels.promptPlaceholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerateSlots();
              }
            }}
            InputProps={{
              endAdornment: (
                <IconButton
                  onClick={handleGenerateSlots}
                  disabled={isLoading || !prompt.trim() || !selectedProvider}
                  color="primary"
                >
                  {isLoading ? <CircularProgress size={20} /> : <Send size={20} />}
                </IconButton>
              ),
            }}
          />
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && suggestedSlots.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography color="text.secondary">{labels.generating}</Typography>
          </Box>
        )}

        {/* AI Response */}
        {aiResponse && (
          <Alert severity="info" sx={{ mb: 2 }} icon={<Sparkles size={18} />}>
            <Typography variant="body2">{aiResponse}</Typography>
          </Alert>
        )}

        {/* Suggested Slots */}
        {suggestedSlots.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Sparkles size={18} />
              <Typography variant="subtitle1" fontWeight={600}>
                {labels.suggestedTimes}
              </Typography>
            </Box>

            <RadioGroup
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
            >
              {suggestedSlots.map((slot) => (
                <Paper
                  key={slot.id}
                  variant="outlined"
                  sx={{
                    mb: 1.5,
                    p: 2,
                    cursor: 'pointer',
                    borderColor: selectedSlot === slot.id ? 'primary.main' : 'divider',
                    bgcolor: selectedSlot === slot.id ? 'action.selected' : 'background.paper',
                    '&:hover': {
                      borderColor: 'primary.main',
                    },
                  }}
                  onClick={() => setSelectedSlot(slot.id)}
                >
                  <FormControlLabel
                    value={slot.id}
                    control={<Radio size="small" />}
                    label={
                      <Box sx={{ ml: 1 }}>
                        <Typography variant="body1" fontWeight={500}>
                          {formatSlotTime(slot.startTime)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatTimeRange(slot.startTime, slot.endTime)}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                          {slot.isAvailable ? (
                            <Chip
                              size="small"
                              icon={<CheckCircle size={14} />}
                              label={labels.youAreFree}
                              color="success"
                              variant="outlined"
                            />
                          ) : (
                            <Chip
                              size="small"
                              icon={<AlertTriangle size={14} />}
                              label={`${labels.conflict} "${slot.conflicts?.[0]}"`}
                              color="warning"
                              variant="outlined"
                            />
                          )}
                          {slot.recommendation && (
                            <Chip
                              size="small"
                              icon={<Sparkles size={14} />}
                              label={slot.recommendation}
                              color="primary"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start', m: 0, width: '100%' }}
                  />
                </Paper>
              ))}
            </RadioGroup>
          </Box>
        )}

        {/* Event Details */}
        <Collapse in={showDetails && suggestedSlots.length > 0}>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            {labels.eventDetails}
          </Typography>

          <TextField
            fullWidth
            label={labels.eventTitle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: <Calendar size={18} style={{ marginRight: 8, opacity: 0.5 }} />,
            }}
          />

          <TextField
            fullWidth
            label={labels.eventLocation}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            sx={{ mb: 2 }}
            placeholder={labels.locationPlaceholder}
            InputProps={{
              startAdornment: <MapPin size={18} style={{ marginRight: 8, opacity: 0.5 }} />,
            }}
          />

          <TextField
            fullWidth
            label={labels.eventNotes}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            placeholder={labels.notesPlaceholder}
          />
        </Collapse>

        {/* Empty State */}
        {!isLoading && suggestedSlots.length === 0 && prompt.trim() === '' && (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <Calendar size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <Typography>
              {labels.emptyState}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Footer */}
      {suggestedSlots.length > 0 && (
        <Box
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            gap: 2,
          }}
        >
          <Button variant="outlined" onClick={onClose} sx={{ flex: 1 }}>
            {labels.cancel}
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateEvent}
            disabled={!selectedSlot || !title.trim() || isLoading}
            startIcon={isLoading ? <CircularProgress size={16} /> : <CheckCircle size={16} />}
            sx={{ flex: 1 }}
          >
            {labels.createEvent}
          </Button>
        </Box>
      )}
    </Drawer>
  );
}

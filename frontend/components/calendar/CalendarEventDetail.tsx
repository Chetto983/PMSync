/**
 * CalendarEventDetail - Dialog for viewing and editing calendar events
 *
 * Features:
 * - View mode with event details
 * - Edit mode with form validation
 * - Attachment list with download
 * - Delete confirmation
 * - Matches dashboard UI/UX patterns with glassmorphism
 *
 * @see https://fullcalendar.io/docs
 */

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  alpha,
  useTheme,
  type Theme,
} from '@mui/material';
import {
  Edit2,
  Trash2,
  X,
  Clock,
  MapPin,
  Paperclip,
  Download,
  FileText,
  Image as ImageIcon,
  File,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateTimeInTz } from '@/lib/utils/format-date-tz';
import type { CalendarEvent as ApiCalendarEvent, CalendarEventAttachment } from '@/lib/api/calendar';
import { AttendeesPicker, type Attendee } from './AttendeesPicker';
import { RSVPButtons, type RSVPResponse } from './RSVPButtons';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ============================================================================
// INTERFACES
// ============================================================================

export interface EditedEventData {
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
}

export interface EditFormErrors {
  title?: string;
  start?: string;
  end?: string;
}

interface CalendarEventDetailProps {
  /** Whether dialog is open */
  open: boolean;
  /** Handler for closing dialog */
  onClose: () => void;
  /** Selected event */
  selectedEvent: ApiCalendarEvent | null;
  /** Whether in edit mode */
  isEditMode: boolean;
  /** Handler for toggling edit mode */
  onEditModeChange: (editMode: boolean) => void;
  /** Edited event data */
  editedEvent: EditedEventData;
  /** Handler for edited event change */
  onEditedEventChange: (event: EditedEventData) => void;
  /** Edit form errors */
  editFormErrors: EditFormErrors;
  /** Handler for form error change */
  onFormErrorChange: (errors: EditFormErrors) => void;
  /** Handler for updating event */
  onUpdate: () => void;
  /** Handler for deleting event */
  onDelete: () => void;
  /** Whether update is in progress */
  isSaving: boolean;
  /** Whether delete is in progress */
  isDeleting: boolean;
  /** Event attachments */
  attachments: CalendarEventAttachment[];
  /** Whether attachments are loading */
  loadingAttachments: boolean;
  /** Handler for downloading attachment */
  onDownloadAttachment: (attachment: CalendarEventAttachment) => void;
  /** Current user email (for RSVP) */
  currentUserEmail?: string;
  /** Handler for RSVP response */
  onRSVPRespond?: (eventId: string, response: RSVPResponse) => Promise<void>;
}

// ============================================================================
// HELPERS
// ============================================================================

function getAttachmentIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) {
    return <ImageIcon size={16} aria-hidden="true" focusable="false" />;
  } else if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
    return <FileText size={16} />;
  }
  return <File size={16} />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const HTML_TAG_RE = /<\/?[a-z][\s\S]*?>/i;

function DescriptionContent({ description, theme }: { description: string; theme: Theme }) {
  const isHtml = HTML_TAG_RE.test(description);
  const sanitized = useMemo(
    () => (isHtml ? DOMPurify.sanitize(description, { ADD_ATTR: ['target'] }) : ''),
    [description, isHtml],
  );

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.background.default, 0.5),
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.08),
      }}
    >
      {isHtml ? (
        <Box
          sx={{ '& a': { color: 'primary.main' }, '& img': { maxWidth: '100%' }, fontSize: '0.875rem', lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      ) : (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {description}
        </Typography>
      )}
    </Box>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CalendarEventDetail({
  open,
  onClose,
  selectedEvent,
  isEditMode,
  onEditModeChange,
  editedEvent,
  onEditedEventChange,
  editFormErrors,
  onFormErrorChange,
  onUpdate,
  onDelete,
  isSaving,
  isDeleting,
  attachments,
  loadingAttachments,
  onDownloadAttachment,
  currentUserEmail,
  onRSVPRespond,
}: CalendarEventDetailProps) {
  const theme = useTheme();
  const t = useTranslations();
  const calendarCopy = t.calendar;
  const timezone = useUserTimezone();
  const { locale } = useLocale();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

  // Handle close with state cleanup
  const handleClose = () => {
    onClose();
    onEditModeChange(false);
    onFormErrorChange({});
    setDeleteConfirmOpen(false);
  };

  // Handle field change with error clearing
  const handleFieldChange = (field: keyof EditedEventData, value: string) => {
    onEditedEventChange({ ...editedEvent, [field]: value });
    if (editFormErrors[field as keyof EditFormErrors]) {
      onFormErrorChange({ ...editFormErrors, [field]: undefined });
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    onEditModeChange(false);
    onFormErrorChange({});
  };

  const handleDeleteRequest = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    await onDelete();
    setDeleteConfirmOpen(false);
  };

  if (!selectedEvent) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          bgcolor: alpha(theme.palette.background.paper, 0.98),
          backdropFilter: 'blur(20px)',
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
        }}
      >
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
          {isEditMode ? calendarCopy.editEvent : calendarCopy.eventDetails}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {!isEditMode && (
            <>
              <IconButton
                size="small"
                onClick={() => onEditModeChange(true)}
                sx={{
                  color: 'text.secondary',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: 'primary.main',
                  },
                }}
              >
                <Edit2 size={18} />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                onClick={handleDeleteRequest}
                disabled={isDeleting}
                sx={{
                  '&:hover': {
                    bgcolor: alpha(theme.palette.error.main, 0.1),
                  },
                }}
              >
                {isDeleting ? <CircularProgress size={18} /> : <Trash2 size={18} />}
              </IconButton>
            </>
          )}
          <IconButton
            size="small"
            onClick={handleClose}
            sx={{
              ml: 0.5,
              color: 'text.secondary',
              '&:hover': {
                bgcolor: alpha(theme.palette.action.hover, 0.8),
              },
            }}
          >
            <X size={18} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {isEditMode ? (
            /* Edit Mode */
            <>
              <TextField
                fullWidth
                label={calendarCopy.eventTitleLabel}
                value={editedEvent.title}
                onChange={(e) => handleFieldChange('title', e.target.value)}
                required
                error={!!editFormErrors.title}
                helperText={editFormErrors.title}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                fullWidth
                label={calendarCopy.startDateTime}
                type="datetime-local"
                value={editedEvent.start}
                onChange={(e) => handleFieldChange('start', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
                error={!!editFormErrors.start}
                helperText={editFormErrors.start}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                fullWidth
                label={calendarCopy.endDateTime}
                type="datetime-local"
                value={editedEvent.end}
                onChange={(e) => handleFieldChange('end', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
                error={!!editFormErrors.end}
                helperText={editFormErrors.end}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                fullWidth
                label={calendarCopy.location}
                value={editedEvent.location}
                onChange={(e) => handleFieldChange('location', e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                fullWidth
                label={calendarCopy.eventDescription}
                multiline
                rows={3}
                value={editedEvent.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </>
          ) : (
            /* View Mode */
            <>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {selectedEvent.title}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
                <Clock size={18} />
                <Typography variant="body2">
                  {formatDateTimeInTz(selectedEvent.startTime, timezone, locale)} - {formatDateTimeInTz(selectedEvent.endTime, timezone, locale)}
                </Typography>
              </Box>

              {selectedEvent.location && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.secondary' }}>
                  <MapPin size={18} />
                  <Typography variant="body2">{selectedEvent.location}</Typography>
                </Box>
              )}

              {selectedEvent.description && (
                <DescriptionContent description={selectedEvent.description} theme={theme} />
              )}

              {selectedEvent.calendarName && (
                <Typography variant="caption" color="text.secondary">
                  {calendarCopy.calendarLabel}: {selectedEvent.calendarName}
                </Typography>
              )}

              {/* Attendees section */}
              {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <AttendeesPicker
                    attendees={selectedEvent.attendees.map((a) => ({
                      email: a.email,
                      name: a.name,
                      responseStatus: a.responseStatus as Attendee['responseStatus'],
                    }))}
                    onChange={() => {}}
                    readOnly
                  />
                </Box>
              )}

              {/* RSVP section - show if user is an attendee */}
              {onRSVPRespond &&
                currentUserEmail &&
                selectedEvent.attendees?.some(
                  (a) => a.email.toLowerCase() === currentUserEmail.toLowerCase()
                ) && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.04),
                      border: '1px solid',
                      borderColor: alpha(theme.palette.primary.main, 0.12),
                    }}
                  >
                    <RSVPButtons
                      eventId={selectedEvent.id}
                      currentStatus={
                        selectedEvent.attendees?.find(
                          (a) => a.email.toLowerCase() === currentUserEmail.toLowerCase()
                        )?.responseStatus as RSVPResponse | 'needsAction' | undefined
                      }
                      onRespond={onRSVPRespond}
                    />
                  </Box>
                )}

              {/* Attachments section */}
              {(attachments.length > 0 || loadingAttachments) && (
                <Box sx={{ mt: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Paperclip size={16} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {calendarCopy.attachments} ({attachments.length})
                    </Typography>
                  </Box>
                  {loadingAttachments ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    <List
                      dense
                      sx={{
                        py: 0,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.background.default, 0.5),
                        border: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.08),
                      }}
                    >
                      {attachments.map((attachment) => (
                        <ListItem
                          key={attachment.id}
                          sx={{
                            px: 1.5,
                            borderRadius: 1.5,
                            transition: 'background-color 0.2s ease',
                            '&:hover': {
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                            },
                          }}
                          secondaryAction={
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => onDownloadAttachment(attachment)}
                              title={calendarCopy.download}
                              sx={{
                                color: 'text.secondary',
                                '&:hover': {
                                  color: 'primary.main',
                                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                                },
                              }}
                            >
                              <Download size={16} />
                            </IconButton>
                          }
                        >
                          <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                            {getAttachmentIcon(attachment.mimeType)}
                          </ListItemIcon>
                          <ListItemText
                            primary={attachment.filename}
                            secondary={formatFileSize(attachment.size)}
                            primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                            secondaryTypographyProps={{ variant: 'caption' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.08),
        }}
      >
        {isEditMode ? (
          <>
            <Button
              onClick={handleCancelEdit}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 500,
              }}
            >
              {calendarCopy.cancelEvent}
            </Button>
            <Button
              variant="contained"
              onClick={onUpdate}
              disabled={isSaving}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                minWidth: 100,
                boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.3)}`,
              }}
            >
              {isSaving ? <CircularProgress size={20} color="inherit" /> : calendarCopy.saveEvent}
            </Button>
          </>
        ) : (
          <Button
            onClick={handleClose}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 500,
            }}
          >
            {calendarCopy.close}
          </Button>
        )}
      </DialogActions>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={calendarCopy.deleteEvent}
        message={calendarCopy.deleteConfirm}
        confirmText={calendarCopy.deleteEvent}
        cancelText={calendarCopy.cancelEvent}
        isLoading={isDeleting}
        variant="danger"
      />
    </Dialog>
  );
}

export default CalendarEventDetail;

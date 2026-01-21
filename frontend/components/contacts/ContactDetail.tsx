import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tabs,
  Tab,
  Card,
  CardContent,
  Tooltip,
  Avatar,
  Stack,
  Link,
  Chip,
  alpha,
  useTheme,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
} from '@mui/material';
import {
  Mail,
  Phone,
  MapPin,
  Building,
  Calendar,
  Edit,
  Trash2,
  Clock,
  Plus,
  Cake,
  Globe,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  MessageSquare,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { Contact, ContactInteraction } from '@/lib/api/contacts';
import { useContactHistory, useContactPhoto } from '@/hooks/queries/use-contacts';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ height: '100%' }}>
      {value === index && <Box sx={{ py: 3, height: '100%' }}>{children}</Box>}
    </div>
  );
}

// Provider Icon Component
const ProviderIcon = ({ providerType, size = 16 }: { providerType: string; size?: number }) => {
  const iconSize = size * 0.6;

  if (providerType === 'google') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: '#ffffff',
          border: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      </Box>
    );
  } else if (providerType === 'microsoft') {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          bgcolor: '#ffffff',
          border: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
          <path d="M11.4 3H3v8.4h8.4V3z" fill="#F25022" />
          <path d="M21 3h-8.4v8.4H21V3z" fill="#7FBA00" />
          <path d="M11.4 12.6H3V21h8.4v-8.4z" fill="#00A4EF" />
          <path d="M21 12.6h-8.4V21H21v-8.4z" fill="#FFB900" />
        </svg>
      </Box>
    );
  }
  return null;
};

/**
 * Props for ContactDetail component
 */
interface ContactDetailProps {
  contact: Contact;
  onClose?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onEmail?: (email: string) => void;
  isLoading?: boolean;
}

function getContactName(contact: Contact, fallback: string = 'Unnamed contact'): string {
  if (contact.displayName) return contact.displayName;
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return contact.emails?.[0]?.value || fallback;
}

function getPrimaryEmail(contact: Contact): string | null {
  const primary = contact.emails?.find((e) => e.primary);
  return primary?.value || contact.emails?.[0]?.value || null;
}

function formatDate(date?: Date | string | null, fallback: string = 'Never'): string {
  if (!date) return fallback;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(date?: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Interaction List Component
const InteractionList = ({ contactId }: { contactId: string }) => {
  const { data: history, isLoading, error } = useContactHistory(contactId);
  const theme = useTheme();
  const t = useTranslations();
  const detailsCopy = t.contacts?.details || {};

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" variant="body2" align="center">
        {detailsCopy.activity?.loadError || 'Failed to load activity history.'}
      </Typography>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {detailsCopy.activity?.noActivity || 'No recent activity found.'}
        </Typography>
      </Box>
    );
  }

  return (
    <List disablePadding>
      {history.map((interaction: ContactInteraction) => {
        let Icon = MessageSquare;
        let color = theme.palette.text.secondary;
        let label = detailsCopy.interactions?.label || 'Interaction';

        switch (interaction.type) {
          case 'EMAIL_SENT':
            Icon = ArrowUpRight;
            color = theme.palette.success.main;
            label = detailsCopy.interactions?.emailSent || 'Email Sent';
            break;
          case 'EMAIL_RECEIVED':
            Icon = ArrowDownLeft;
            color = theme.palette.info.main;
            label = detailsCopy.interactions?.emailReceived || 'Email Received';
            break;
          case 'MEETING':
            Icon = Calendar;
            color = theme.palette.warning.main;
            label = detailsCopy.interactions?.meeting || 'Meeting';
            break;
          case 'CALL':
            Icon = Phone;
            color = theme.palette.secondary.main;
            label = detailsCopy.interactions?.call || 'Call';
            break;
          case 'NOTE':
            Icon = Edit;
            color = theme.palette.text.secondary;
            label = detailsCopy.interactions?.note || 'Note';
            break;
        }

        return (
          <ListItem
            key={interaction.id}
            alignItems="flex-start"
            sx={{
              mb: 1,
              bgcolor: alpha(theme.palette.background.paper, 0.4),
              backdropFilter: 'blur(10px)',
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: alpha(color, 0.1), color: color }}>
                <Icon size={20} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {interaction.summary || label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(interaction.date)}
                  </Typography>
                </Box>
              }
              secondary={
                <React.Fragment>
                  <Typography
                    variant="body2"
                    color="text.primary"
                    component="span"
                    sx={{ display: 'block', mt: 0.5 }}
                  >
                    {interaction.type === 'EMAIL_SENT' ? `To: ${interaction.contactEmail || 'Contact'}` :
                      interaction.type === 'EMAIL_RECEIVED' ? `From: ${interaction.contactEmail || 'Contact'}` :
                        interaction.sourceType}
                  </Typography>
                  {interaction.sentiment && (
                    <Chip
                      label={interaction.sentiment}
                      size="small"
                      sx={{
                        mt: 0.5,
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: interaction.sentiment === 'POSITIVE' ? alpha(theme.palette.success.main, 0.1) :
                          interaction.sentiment === 'NEGATIVE' ? alpha(theme.palette.error.main, 0.1) :
                            alpha(theme.palette.text.secondary, 0.1),
                        color: interaction.sentiment === 'POSITIVE' ? theme.palette.success.main :
                          interaction.sentiment === 'NEGATIVE' ? theme.palette.error.main :
                            theme.palette.text.secondary
                      }}
                    />
                  )}
                </React.Fragment>
              }
            />
          </ListItem>
        );
      })}
    </List>
  );
};

export const ContactDetail: React.FC<ContactDetailProps> = ({
  contact,
  onClose,
  onEdit,
  onDelete,
  onEmail,
  isLoading = false,
}) => {
  const theme = useTheme();
  const t = useTranslations();
  const contactsCopy = t.contacts || {};
  const detailsCopy = contactsCopy.details || {};
  const [tabValue, setTabValue] = useState(0);

  // Glassmorphism card styles
  const glassCardSx = {
    bgcolor: alpha(theme.palette.background.paper, 0.7),
    backdropFilter: 'blur(20px)',
    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
    borderRadius: 2,
    transition: 'all 0.2s ease-in-out',
    '&:hover': {
      bgcolor: alpha(theme.palette.background.paper, 0.85),
      borderColor: alpha(theme.palette.primary.main, 0.2),
    },
  };

  const contactName = useMemo(() => getContactName(contact, t.common?.unnamedContact ?? 'Unnamed contact'), [contact, t.common?.unnamedContact]);
  const primaryEmail = useMemo(() => getPrimaryEmail(contact), [contact]);

  // Lazy-load photo for contacts synced from providers (Microsoft/Google) that don't have photoUrl yet
  const hasProviderContacts = !!(contact.providerContacts && contact.providerContacts.length > 0);
  const { data: fetchedPhotoUrl } = useContactPhoto(contact.id, hasProviderContacts, contact.photoUrl);

  // Use fetched photo URL if available, otherwise use existing photoUrl
  const photoUrl = fetchedPhotoUrl || contact.photoUrl;

  // Use CRM Intelligence field if available, fallback to updatedAt/createdAt
  const lastInteraction = contact.lastInteractedAt || contact.updatedAt || contact.createdAt;

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
        {/* Mobile back button - separate row for better touch target */}
        {onClose && (
          <Box
            sx={{
              display: { xs: 'flex', md: 'none' },
              mb: 2,
            }}
          >
            <IconButton
              onClick={onClose}
              aria-label={t.email?.view?.back || 'Back'}
              edge="start"
              sx={{
                p: 1,
                '&:active': {
                  bgcolor: 'action.selected',
                },
              }}
            >
              <ArrowLeft size={24} />
            </IconButton>
          </Box>
        )}

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Avatar
            src={photoUrl || undefined}
            sx={{ width: 72, height: 72, bgcolor: 'primary.main', fontSize: '2rem' }}
          >
            {contactName[0]?.toUpperCase() || 'U'}
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
              {contactName}
            </Typography>
            {(contact.jobTitle || contact.company) && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {contact.jobTitle}
                {contact.company && ` ${detailsCopy.at ?? 'at'} ${contact.company}`}
              </Typography>
            )}

            {/* Relationship Score Chip */}
            {typeof contact.relationshipScore === 'number' && (
              <Chip
                label={`Score: ${contact.relationshipScore}`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ mt: 0.5 }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {onEdit && (
              <Tooltip title={t.common?.edit || 'Edit'}>
                <IconButton size="small" onClick={onEdit} disabled={isLoading}>
                  <Edit size={18} />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title={t.common?.delete || 'Delete'}>
                <IconButton size="small" onClick={onDelete} disabled={isLoading}>
                  <Trash2 size={18} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<Mail size={18} />}
            disabled={!primaryEmail}
            onClick={() => primaryEmail && onEmail?.(primaryEmail)}
          >
            {contactsCopy.actions?.email || 'Send Email'}
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label={detailsCopy.tabs?.details || 'Details'} />
          <Tab label={detailsCopy.tabs?.activity || 'Activity'} />
          <Tab label={detailsCopy.tabs?.notes || 'Notes'} />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 3 }}>
        <TabPanel value={tabValue} index={0}>
          {/* Provider Sources */}
          {contact.providerContacts && contact.providerContacts.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {contactsCopy.details?.syncedFrom || 'Synced from'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {contact.providerContacts.map((pc) => (
                  <Chip
                    key={pc.id}
                    icon={<ProviderIcon providerType={pc.provider.providerType} size={20} />}
                    label={`${pc.provider.providerType === 'google' ? 'Gmail' : 'Outlook'}: ${pc.provider.email}`}
                    size="small"
                    sx={{ bgcolor: 'action.hover', '& .MuiChip-icon': { ml: 0.5 } }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Email Addresses */}
          {contact.emails && contact.emails.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.details?.emailAddresses || 'Email Addresses'}
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                {contact.emails.map((email, idx) => (
                  <Card variant="outlined" key={idx} sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Mail size={18} color={theme.palette.info.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {email.type || detailsCopy.emailType || 'Email'} {email.primary && `(${detailsCopy.primary ?? 'Primary'})`}
                        </Typography>
                      </Box>
                      <Link href={`mailto:${email.value}`} underline="hover">
                        <Typography variant="body1">{email.value}</Typography>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          )}

          {/* Phone Numbers */}
          {contact.phoneNumbers && contact.phoneNumbers.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.details?.phoneNumbers || 'Phone Numbers'}
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                {contact.phoneNumbers.map((phone, idx) => (
                  <Card variant="outlined" key={idx} sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Phone size={18} color={theme.palette.success.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {phone.type || detailsCopy.phoneType || 'Phone'} {phone.primary && `(${detailsCopy.primary ?? 'Primary'})`}
                        </Typography>
                      </Box>
                      <Link href={`tel:${phone.value}`} underline="hover">
                        <Typography variant="body1">{phone.value}</Typography>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          )}

          {/* Addresses */}
          {contact.addresses && contact.addresses.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.details?.addresses || 'Addresses'}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {contact.addresses.map((address, idx) => (
                  <Card variant="outlined" key={idx} sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <MapPin size={18} color={theme.palette.secondary.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {address.type || detailsCopy.addressType || 'Address'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">
                        {[address.street, address.city, address.state, address.postalCode, address.country]
                          .filter(Boolean)
                          .join(', ')}
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          )}

          {/* Professional Information */}
          {(contact.company || contact.jobTitle || contact.department) && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.details?.professional || 'Professional'}
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                {contact.company && (
                  <Card variant="outlined" sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Building size={18} color={theme.palette.warning.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {contactsCopy.details?.company || 'Company'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">{contact.company}</Typography>
                    </CardContent>
                  </Card>
                )}
                {contact.jobTitle && (
                  <Card variant="outlined" sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Building size={18} color={theme.palette.warning.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {contactsCopy.details?.jobTitle || 'Job Title'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">{contact.jobTitle}</Typography>
                    </CardContent>
                  </Card>
                )}
                {contact.department && (
                  <Card variant="outlined" sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Building size={18} color={theme.palette.warning.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {contactsCopy.details?.department || 'Department'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">{contact.department}</Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>
            </Box>
          )}

          {/* Important Dates */}
          {(contact.birthday || contact.anniversary) && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.details?.importantDates || 'Important Dates'}
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                {contact.birthday && (
                  <Card variant="outlined" sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Cake size={18} color={theme.palette.error.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {contactsCopy.details?.birthday || 'Birthday'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">
                        {new Date(contact.birthday).toLocaleDateString()}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
                {contact.anniversary && (
                  <Card variant="outlined" sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Calendar size={18} color={theme.palette.error.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {contactsCopy.details?.anniversary || 'Anniversary'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">
                        {new Date(contact.anniversary).toLocaleDateString()}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>
            </Box>
          )}

          {/* Websites */}
          {contact.websites && contact.websites.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {contactsCopy.details?.websites || 'Websites'}
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                {contact.websites.map((website, idx) => (
                  <Card variant="outlined" key={idx} sx={glassCardSx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Globe size={18} color={theme.palette.success.main} />
                        <Typography variant="subtitle2" color="text.secondary">
                          {website.type || detailsCopy.websiteType || 'Website'}
                        </Typography>
                      </Box>
                      <Link href={website.url} target="_blank" rel="noopener noreferrer" underline="hover">
                        <Typography variant="body1">{website.url}</Typography>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Box>
          )}

          {/* Notes */}
          {contact.notes && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {detailsCopy.notes?.title || 'Notes'}
              </Typography>
              <Card variant="outlined" sx={glassCardSx}>
                <CardContent>
                  <Typography variant="body2">{contact.notes}</Typography>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* CRM Intelligence */}
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              {detailsCopy.relationshipIntelligence || 'Relationship Intelligence'}
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              <Card variant="outlined" sx={glassCardSx}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Clock size={18} color={theme.palette.text.secondary} />
                    <Typography variant="subtitle2" color="text.secondary">
                      {contactsCopy.details?.lastInteraction || 'Last Interaction'}
                    </Typography>
                  </Box>
                  <Typography variant="body1">{formatDate(lastInteraction, detailsCopy.never ?? 'Never')}</Typography>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={glassCardSx}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <MessageSquare size={18} color={theme.palette.text.secondary} />
                    <Typography variant="subtitle2" color="text.secondary">
                      {detailsCopy.totalInteractions || 'Total Interactions'}
                    </Typography>
                  </Box>
                  <Typography variant="body1">{contact.totalInteractions ?? 0}</Typography>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {detailsCopy.activity?.title || 'Activity'}
          </Typography>
          <InteractionList contactId={contact.id} />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {detailsCopy.notes?.title || 'Notes'}
          </Typography>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              {detailsCopy.notes?.noNotes || 'No notes yet'}
            </Typography>
            <Button variant="contained" startIcon={<Plus size={18} />} sx={{ mt: 2 }}>
              {detailsCopy.notes?.addNote || 'Add Note'}
            </Button>
          </Box>
        </TabPanel>
      </Box>
    </Box>
  );
};

export default ContactDetail;

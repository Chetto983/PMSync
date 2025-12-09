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
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { Contact } from '@/lib/api/contacts';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
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
  /**
   * Contact to display
   */
  contact: Contact;

  /**
   * Callback to close detail panel
   */
  onClose?: () => void;

  /**
   * Callback to edit contact
   */
  onEdit?: () => void;

  /**
   * Callback to delete contact
   */
  onDelete?: () => void;

  /**
   * Callback to email contact
   */
  onEmail?: (email: string) => void;

  /**
   * Whether actions are loading
   */
  isLoading?: boolean;
}

/**
 * Get display name from contact
 */
function getContactName(contact: Contact, fallback: string = 'Unnamed contact'): string {
  if (contact.displayName) return contact.displayName;
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return contact.emails?.[0]?.value || fallback;
}

/**
 * Get primary email from contact
 */
function getPrimaryEmail(contact: Contact): string | null {
  const primary = contact.emails?.find((e) => e.primary);
  return primary?.value || contact.emails?.[0]?.value || null;
}

/**
 * Format date for display
 */
function formatDate(date?: Date | string | null, fallback: string = 'Never'): string {
  if (!date) return fallback;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * ContactDetail - Contact detail panel with tabs
 *
 * Features:
 * - Header with avatar and actions
 * - Tabs: Details, Activity, Notes
 * - Full contact information display
 * - Provider sources
 */
export const ContactDetail: React.FC<ContactDetailProps> = ({
  contact,
  onClose,
  onEdit,
  onDelete,
  onEmail,
  isLoading = false,
}) => {
  const t = useTranslations();
  const contactsCopy = t.contacts || {};
  const detailsCopy = contactsCopy.details || {};
  const [tabValue, setTabValue] = useState(0);

  const contactName = useMemo(() => getContactName(contact, t.common?.unnamedContact ?? 'Unnamed contact'), [contact, t.common?.unnamedContact]);
  const primaryEmail = useMemo(() => getPrimaryEmail(contact), [contact]);
  const lastInteraction = contact.updatedAt || contact.createdAt;

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
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          {/* Back button for mobile */}
          {onClose && (
            <IconButton
              onClick={onClose}
              sx={{ display: { xs: 'flex', md: 'none' }, mr: 1 }}
            >
              <ArrowLeft size={20} />
            </IconButton>
          )}

          <Avatar
            src={contact.photoUrl || undefined}
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
          <Tab label={contactsCopy.tabs?.details || 'Details'} />
          <Tab label={contactsCopy.tabs?.activity || 'Activity'} />
          <Tab label={contactsCopy.tabs?.notes || 'Notes'} />
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
                  <Card variant="outlined" key={idx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Mail size={18} color="#0B7EFF" />
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
                  <Card variant="outlined" key={idx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Phone size={18} color="#00C853" />
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
                  <Card variant="outlined" key={idx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <MapPin size={18} color="#9C27B0" />
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
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Building size={18} color="#FF9800" />
                        <Typography variant="subtitle2" color="text.secondary">
                          {contactsCopy.details?.company || 'Company'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">{contact.company}</Typography>
                    </CardContent>
                  </Card>
                )}
                {contact.jobTitle && (
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Building size={18} color="#FF9800" />
                        <Typography variant="subtitle2" color="text.secondary">
                          {contactsCopy.details?.jobTitle || 'Job Title'}
                        </Typography>
                      </Box>
                      <Typography variant="body1">{contact.jobTitle}</Typography>
                    </CardContent>
                  </Card>
                )}
                {contact.department && (
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Building size={18} color="#FF9800" />
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
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Cake size={18} color="#E91E63" />
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
                  <Card variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Calendar size={18} color="#E91E63" />
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
                  <Card variant="outlined" key={idx}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Globe size={18} color="#4CAF50" />
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
                {contactsCopy.notes?.title || 'Notes'}
              </Typography>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="body2">{contact.notes}</Typography>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Last Interaction */}
          <Box>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Clock size={18} color="#757575" />
                  <Typography variant="subtitle2" color="text.secondary">
                    {contactsCopy.details?.lastInteraction || 'Last Interaction'}
                  </Typography>
                </Box>
                <Typography variant="body1">{formatDate(lastInteraction, detailsCopy.never ?? 'Never')}</Typography>
              </CardContent>
            </Card>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {contactsCopy.activity?.title || 'Activity'}
          </Typography>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              {contactsCopy.activity?.noActivity || 'No recent activity'}
            </Typography>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {contactsCopy.notes?.title || 'Notes'}
          </Typography>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              {contactsCopy.notes?.noNotes || 'No notes yet'}
            </Typography>
            <Button variant="contained" startIcon={<Plus size={18} />} sx={{ mt: 2 }}>
              {contactsCopy.notes?.addNote || 'Add Note'}
            </Button>
          </Box>
        </TabPanel>
      </Box>
    </Box>
  );
};

export default ContactDetail;

import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Link,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Mail,
  Phone,
  MapPin,
  Building,
  Calendar,
  Clock,
  Cake,
  Globe,
  MessageSquare,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import type { Contact } from '@/lib/api/contacts';
import { ProviderIcon } from './ProviderIcon';
import { ContactAccountsSection } from './ContactAccountsSection';
import { formatDate } from './contact-detail-utils';

export interface ContactInfoPanelProps {
  contact: Contact;
  lastInteraction: Date | string | null | undefined;
}

export function ContactInfoPanel({ contact, lastInteraction }: ContactInfoPanelProps) {
  const theme = useTheme();
  const t = useTranslations();
  const { locale } = useLocale();
  const contactsCopy = t.contacts || {};
  const detailsCopy = contactsCopy.details || {};

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

  return (
    <>
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

      {/* Linked Accounts */}
      <ContactAccountsSection contactId={contact.id} />

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
                    {new Date(contact.birthday).toLocaleDateString(locale)}
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
                    {new Date(contact.anniversary).toLocaleDateString(locale)}
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
              <Typography variant="body1">{formatDate(lastInteraction, detailsCopy.never ?? 'Never', locale)}</Typography>
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
    </>
  );
}

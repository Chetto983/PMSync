import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tabs,
  Tab,
  Tooltip,
  Avatar,
  Stack,
  Chip,
} from '@mui/material';
import {
  Mail,
  Edit,
  Trash2,
  X,
  Star,
  GitMerge,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { Contact } from '@/lib/api/contacts';
import { useContactPhoto, useToggleVip } from '@/hooks/queries/use-contacts';
import { TabPanel, getContactName, getPrimaryEmail } from './contact-detail/contact-detail-utils';
import { ContactInfoPanel } from './contact-detail/ContactInfoPanel';
import { ContactActivityFeed } from './contact-detail/ContactActivityFeed';
import { ContactNotesTab } from './contact-detail/ContactNotesTab';
import { ContactCrmTab } from './contact-detail/ContactCrmTab';
import { ChurnRiskBadge } from '../dashboard/crm-churn/ChurnRiskBadge';
import { ContactDuplicatesDialog } from './ContactDuplicatesDialog';
import { ContactMergeDialog } from './ContactMergeDialog';

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
  const [dupsOpen, setDupsOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<Contact | null>(null);

  const toggleVipMutation = useToggleVip();
  const handleToggleVip = useCallback(() => {
    toggleVipMutation.mutate(contact.id);
  }, [toggleVipMutation, contact.id]);

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
            <ChurnRiskBadge contactId={contact.id} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={contact.isVip ? (contactsCopy.actions?.removeVip || 'Remove VIP') : (contactsCopy.actions?.markVip || 'Mark as VIP')}>
              <IconButton
                size="small"
                onClick={handleToggleVip}
                disabled={isLoading || toggleVipMutation.isPending}
                aria-label={contact.isVip ? (contactsCopy.actions?.removeVip || 'Remove VIP') : (contactsCopy.actions?.markVip || 'Mark as VIP')}
                sx={{ color: contact.isVip ? 'warning.main' : 'action.disabled' }}
              >
                <Star size={18} fill={contact.isVip ? 'currentColor' : 'none'} />
              </IconButton>
            </Tooltip>
            {onEdit && (
              <Tooltip title={t.common?.edit || 'Edit'}>
                <IconButton size="small" onClick={onEdit} disabled={isLoading} aria-label={t.common?.edit || 'Edit'}>
                  <Edit size={18} />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title={t.common?.delete || 'Delete'}>
                <IconButton size="small" onClick={onDelete} disabled={isLoading} aria-label={t.common?.delete || 'Delete'}>
                  <Trash2 size={18} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t.contacts?.duplicates?.findDuplicates || 'Find Duplicates'}>
              <IconButton size="small" onClick={() => setDupsOpen(true)} disabled={isLoading} aria-label={t.contacts?.duplicates?.findDuplicates || 'Find Duplicates'}>
                <GitMerge size={18} />
              </IconButton>
            </Tooltip>
            {/* Mobile close button */}
            {onClose && (
              <IconButton
                size="small"
                onClick={onClose}
                aria-label={t.common?.close || 'Close'}
                sx={{ display: { xs: 'inline-flex', md: 'none' } }}
              >
                <X size={18} />
              </IconButton>
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
          {!primaryEmail && (
            <Typography variant="caption" color="text.secondary">
              {detailsCopy.addEmailHint || 'Add an email address to the contact to send a message.'}
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
          <Tab label={detailsCopy.tabs?.details || 'Details'} />
          <Tab label={detailsCopy.tabs?.activity || 'Activity'} />
          <Tab label={detailsCopy.tabs?.notes || 'Notes'} />
          <Tab label="CRM" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 3 }}>
        <TabPanel value={tabValue} index={0}>
          <ContactInfoPanel contact={contact} lastInteraction={lastInteraction} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {detailsCopy.activity?.title || 'Activity'}
          </Typography>
          <ContactActivityFeed contactId={contact.id} />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <ContactNotesTab />
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <ContactCrmTab contactId={contact.id} />
        </TabPanel>
      </Box>

      <ContactDuplicatesDialog
        open={dupsOpen}
        onClose={() => setDupsOpen(false)}
        contact={contact}
        onMergeRequest={(dup) => {
          setDupsOpen(false);
          setMergeTarget(dup);
        }}
      />

      {mergeTarget && (
        <ContactMergeDialog
          open={!!mergeTarget}
          onClose={() => setMergeTarget(null)}
          contactA={contact}
          contactB={mergeTarget}
          onMergeComplete={() => setMergeTarget(null)}
        />
      )}
    </Box>
  );
};

export default ContactDetail;

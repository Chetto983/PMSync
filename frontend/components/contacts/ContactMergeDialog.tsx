import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Radio,
  Alert,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useMergeContacts } from '@/hooks/queries/use-contacts';
import type { Contact } from '@/lib/api/contacts';

interface ContactMergeDialogProps {
  open: boolean;
  onClose: () => void;
  contactA: Contact | null;
  contactB: Contact | null;
  onMergeComplete?: () => void;
}

/** Mergeable scalar fields with display labels */
const MERGE_FIELDS = [
  'firstName',
  'lastName',
  'displayName',
  'company',
  'jobTitle',
  'department',
  'notes',
  'birthday',
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];

/** Get display label for a field using translation keys */
function getFieldLabel(field: MergeField, t: ReturnType<typeof useTranslations>): string {
  const map: Record<MergeField, string> = {
    firstName: t.contacts?.createDialog?.firstName ?? 'First Name',
    lastName: t.contacts?.createDialog?.lastName ?? 'Last Name',
    displayName: t.contacts?.editDialog?.displayName ?? 'Display Name',
    company: t.contacts?.createDialog?.company ?? 'Company',
    jobTitle: t.contacts?.createDialog?.jobTitle ?? 'Job Title',
    department: t.contacts?.createDialog?.department ?? 'Department',
    notes: t.contacts?.createDialog?.notes ?? 'Notes',
    birthday: t.contacts?.details?.birthday ?? 'Birthday',
  };
  return map[field];
}

/** Get a scalar value from a contact by field name */
function getFieldValue(contact: Contact, field: MergeField): string {
  const val = contact[field as keyof Contact];
  if (val == null) return '';
  return String(val);
}

/**
 * ContactMergeDialog — side-by-side comparison of two contacts.
 * User picks which field value to keep from each. Merges via PATCH + DELETE.
 */
export function ContactMergeDialog({
  open,
  onClose,
  contactA,
  contactB,
  onMergeComplete,
}: ContactMergeDialogProps) {
  const theme = useTheme();
  const t = useTranslations();
  const mg = t.contacts?.merge;

  const mergeContactsMutation = useMergeContacts();

  // Track which side is selected for each field: 'a' or 'b'
  const [selections, setSelections] = useState<Record<MergeField, 'a' | 'b'>>(() => {
    const initial = {} as Record<MergeField, 'a' | 'b'>;
    for (const f of MERGE_FIELDS) initial[f] = 'a';
    return initial;
  });
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = useCallback((field: MergeField, side: 'a' | 'b') => {
    setSelections((prev) => ({ ...prev, [field]: side }));
  }, []);

  const handleMerge = useCallback(async () => {
    if (!contactA || !contactB) return;

    setMerging(true);
    setError(null);

    try {
      // Build field selections for the backend merge endpoint
      const fieldSelections: Record<string, 'primary' | 'secondary'> = {};
      for (const field of MERGE_FIELDS) {
        fieldSelections[field] = selections[field] === 'a' ? 'primary' : 'secondary';
      }

      await mergeContactsMutation.mutateAsync({
        primaryId: contactA.id,
        secondaryId: contactB.id,
        fieldSelections,
      });

      onMergeComplete?.();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : (mg?.error ?? 'Failed to merge contacts.'),
      );
    } finally {
      setMerging(false);
    }
  }, [contactA, contactB, selections, mergeContactsMutation, mg, onClose, onMergeComplete]);

  if (!contactA || !contactB) return null;

  const contactAName = contactA.displayName || [contactA.firstName, contactA.lastName].filter(Boolean).join(' ') || mg?.contact1 || 'Contact A';
  const contactBName = contactB.displayName || [contactB.firstName, contactB.lastName].filter(Boolean).join(' ') || mg?.contact2 || 'Contact B';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{mg?.title ?? 'Merge Contacts'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {mg?.description ?? 'Select which fields to keep from each contact.'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: '20%' }}>
                  {mg?.field ?? 'Field'}
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 600,
                    width: '40%',
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  }}
                >
                  {contactAName}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: '40%' }}>
                  {contactBName}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {MERGE_FIELDS.map((field) => {
                const valA = getFieldValue(contactA, field);
                const valB = getFieldValue(contactB, field);
                const noValue = mg?.noValue ?? '(empty)';

                // Skip fields where both are empty
                if (!valA && !valB) return null;

                return (
                  <TableRow key={field}>
                    <TableCell sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                      {getFieldLabel(field, t)}
                    </TableCell>
                    <TableCell
                      onClick={() => handleSelect(field, 'a')}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: selections[field] === 'a'
                          ? alpha(theme.palette.primary.main, 0.08)
                          : 'transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Radio
                          size="small"
                          checked={selections[field] === 'a'}
                          onChange={() => handleSelect(field, 'a')}
                        />
                        <Typography
                          variant="body2"
                          color={valA ? 'text.primary' : 'text.disabled'}
                          sx={{ wordBreak: 'break-word' }}
                        >
                          {valA || noValue}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell
                      onClick={() => handleSelect(field, 'b')}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: selections[field] === 'b'
                          ? alpha(theme.palette.primary.main, 0.08)
                          : 'transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Radio
                          size="small"
                          checked={selections[field] === 'b'}
                          onChange={() => handleSelect(field, 'b')}
                        />
                        <Typography
                          variant="body2"
                          color={valB ? 'text.primary' : 'text.disabled'}
                          sx={{ wordBreak: 'break-word' }}
                        >
                          {valB || noValue}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Emails row — always merged (union) */}
              <TableRow>
                <TableCell sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                  {t.contacts?.details?.emailAddresses ?? 'Email Addresses'}
                </TableCell>
                <TableCell colSpan={2}>
                  <Typography variant="caption" color="text.secondary">
                    {(contactA.emails?.length ?? 0) + (contactB.emails?.length ?? 0)} email(s) — all will be merged
                  </Typography>
                </TableCell>
              </TableRow>

              {/* Phones row — always merged (union) */}
              <TableRow>
                <TableCell sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
                  {t.contacts?.details?.phoneNumbers ?? 'Phone Numbers'}
                </TableCell>
                <TableCell colSpan={2}>
                  <Typography variant="caption" color="text.secondary">
                    {(contactA.phoneNumbers?.length ?? 0) + (contactB.phoneNumbers?.length ?? 0)} phone(s) — all will be merged
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={merging}>
          {t.common?.cancel ?? 'Cancel'}
        </Button>
        <Button
          variant="contained"
          onClick={handleMerge}
          disabled={merging}
          startIcon={merging ? <CircularProgress size={16} /> : undefined}
        >
          {mg?.confirm ?? 'Merge'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ContactMergeDialog;

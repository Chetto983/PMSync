import { makeAssistantToolUI } from '@assistant-ui/react';
import { User, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ContactSearchResult, ContactItem } from '../types';

function ContactCard({ contact, isFirst }: { contact: ContactItem; isFirst: boolean }) {
  const name = contact.displayName ?? ([contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown');
  const primaryEmail = contact.emails?.[0]?.value ?? null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        py: 1,
        px: 1,
        borderRadius: 1,
        borderTop: isFirst ? 0 : 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color 0.15s ease',
      }}
    >
      <Box
        sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.light', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.8 }}
      >
        <User size={16} style={{ color: 'inherit' }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </Typography>
        {(contact.jobTitle || contact.company) && (
          <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {[contact.jobTitle, contact.company].filter(Boolean).join(' at ')}
          </Typography>
        )}
        {primaryEmail && (
          <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
            {primaryEmail}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export const ContactToolUI = makeAssistantToolUI<
  { query: string },
  ContactSearchResult
>({
  toolName: 'search_contacts',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 'fit-content', borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5 }}>
          <User size={16} style={{ opacity: 0.6 }} />
          <Typography variant="body2" color="text.secondary">Searching contacts for &ldquo;{args.query}&rdquo;...</Typography>
        </Box>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">
            Contact search failed: {'reason' in status ? status.reason : 'unknown'}
          </Typography>
        </Box>
      );
    }
    if (!result) return null;
    if (result.error) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
          <AlertCircle size={16} />
          <Typography variant="body2" color="error.main">{result.error}</Typography>
        </Box>
      );
    }
    const contacts = result.data ?? [];
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Contacts
          </Typography>
          <Typography variant="caption" color="text.secondary">{contacts.length} found</Typography>
        </Box>
        {contacts.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>No contacts found.</Typography>
        ) : (
          <Box>
            {contacts.map((c, idx) => (
              <ContactCard key={c.id} contact={c} isFirst={idx === 0} />
            ))}
          </Box>
        )}
        {result.summary && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
            {result.summary}
          </Typography>
        )}
      </Paper>
    );
  },
});

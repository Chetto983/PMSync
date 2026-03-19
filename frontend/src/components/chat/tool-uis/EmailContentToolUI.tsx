import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Mail, Paperclip, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { EmailContentResult, EmailContentItem } from '../types';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function EmailCard({ email }: { email: EmailContentItem }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Mail size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
          <Typography variant="body2" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {email.from}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatDate(email.date)}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {email.subject ?? '(no subject)'}
      </Typography>
      <Box sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          To: {email.to.join(', ')}
          {email.cc.length > 0 && <Box component="span" sx={{ ml: 1 }}>Cc: {email.cc.join(', ')}</Box>}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ opacity: 0.8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        {truncate(email.content, 500)}
      </Typography>
      {email.hasAttachments && email.attachments.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          {email.attachments.map((name, i) => (
            <Box
              key={i}
              component="span"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.25, fontSize: '0.75rem', borderRadius: '9999px', bgcolor: 'action.hover', color: 'text.secondary' }}
            >
              <Paperclip size={12} />
              {name}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );
}

export function EmailContentRenderer({
  result,
  status,
}: ToolCallMessagePartProps<
  { emailId?: string; emailIds?: string[] },
  EmailContentResult
>) {
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 'fit-content', borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5 }}>
        <Mail size={16} style={{ opacity: 0.6 }} />
        <Typography variant="body2" color="text.secondary">Loading email content...</Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
        <AlertCircle size={16} />
        <Typography variant="body2" color="error.main">
          Failed to load email: {'reason' in status ? status.reason : 'unknown'}
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
  const emails = result.emails ?? [];
  if (emails.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
        No email content found.
      </Typography>
    );
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {emails.map((email) => (
        <EmailCard key={email.id} email={email} />
      ))}
    </Box>
  );
}

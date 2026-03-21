import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Mail, Paperclip, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/lib/hooks/use-translations';
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

function EmailCard({ email, tu }: { email: EmailContentItem; tu: Record<string, string | undefined> }) {
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
        {email.subject ?? tu.noSubject ?? '(no subject)'}
      </Typography>
      <Box sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {(tu.to ?? 'To: {value}').replace('{value}', email.to.join(', '))}
          {email.cc.length > 0 && <Box component="span" sx={{ ml: 1 }}>{(tu.cc ?? 'Cc: {value}').replace('{value}', email.cc.join(', '))}</Box>}
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
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 'fit-content', borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5 }}>
        <Mail size={16} style={{ opacity: 0.6 }} />
        <Typography variant="body2" color="text.secondary">{tu?.loadingEmailContent || 'Loading email content...'}</Typography>
      </Box>
    );
  }
  if (status.type === 'incomplete') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
        <AlertCircle size={16} />
        <Typography variant="body2" color="error.main">
          {(tu?.failedToLoad ?? 'Failed to load email: {error}').replace('{error}', 'reason' in status ? status.reason : 'unknown')}
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
  // Backend read_email returns a single email object with content in `bodyText`
  const email: EmailContentItem = {
    id: result.id,
    from: result.from,
    to: Array.isArray(result.to) ? result.to : [],
    cc: Array.isArray(result.cc) ? result.cc : [],
    subject: result.subject,
    content: result.bodyText ?? result.content ?? '',
    date: result.date,
    isRead: result.isRead ?? false,
    isStarred: result.isStarred ?? false,
    folder: result.folder ?? '',
    hasAttachments: result.hasAttachments ?? false,
    attachments: result.attachments ?? [],
  };
  if (!email.id) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
        {tu?.noEmailContent ?? 'No email content found.'}
      </Typography>
    );
  }
  return <EmailCard email={email} tu={tu ?? {}} />;
}

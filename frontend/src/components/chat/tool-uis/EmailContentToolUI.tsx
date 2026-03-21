import { useState } from 'react';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Paperclip, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import Button from '@mui/material/Button';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailContentResult, EmailContentItem } from '../types';
import { SenderAvatar } from './shared/SenderAvatar';

/** Max chars before collapsing plain-text body */
const COLLAPSE_THRESHOLD = 400;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EmailCard({ email, tu }: { email: EmailContentItem; tu: Record<string, string | undefined> }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = email.content.length > COLLAPSE_THRESHOLD;
  const displayContent = isLong && !expanded ? email.content.slice(0, COLLAPSE_THRESHOLD) + '...' : email.content;

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', overflow: 'hidden', boxShadow: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, pt: 1.5, pb: 1 }}>
        <SenderAvatar name={email.from} size={32} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email.from}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              {formatDate(email.date)}
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(tu.to ?? 'To: {value}').replace('{value}', email.to.join(', '))}
            {email.cc.length > 0 && ` · ${(tu.cc ?? 'Cc: {value}').replace('{value}', email.cc.join(', '))}`}
          </Typography>
        </Box>
      </Box>

      {/* Subject */}
      <Typography variant="body2" sx={{ fontWeight: 600, px: 1.5, pb: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {email.subject ?? tu.noSubject ?? '(no subject)'}
      </Typography>

      {/* Body */}
      <Box sx={{ px: 1.5, pb: 1.5 }}>
        <Typography variant="body2" sx={{ opacity: 0.85, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.84rem' }}>
          {displayContent}
        </Typography>
        {isLong && (
          <Button
            size="small"
            onClick={() => setExpanded(!expanded)}
            startIcon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.75rem', color: 'text.secondary' }}
          >
            {expanded ? (tu.showLess ?? 'Show less') : (tu.showMore ?? 'Show more')}
          </Button>
        )}
      </Box>

      {/* Attachments */}
      {email.hasAttachments && email.attachments.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, px: 1.5, pb: 1.5, pt: 0.5, borderTop: 1, borderColor: 'divider' }}>
          {email.attachments.map((name, i) => (
            <Box
              key={i}
              component="span"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, fontSize: '0.75rem', borderRadius: '8px', bgcolor: 'action.hover', color: 'text.secondary', border: 1, borderColor: 'divider' }}
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

function LoadingSkeleton() {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
        <Skeleton variant="circular" width={32} height={32} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="60%" height={18} />
          <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
        </Box>
      </Box>
      <Skeleton width="80%" height={18} sx={{ mb: 1 }} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="70%" height={14} />
    </Paper>
  );
}

function ErrorBox({ message, tu }: { message: string; tu: Record<string, string | undefined> }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AlertCircle size={16} color="var(--mui-palette-error-main)" />
        <Typography variant="body2" color="error.main" sx={{ flex: 1 }}>{message}</Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {tu.retry ?? 'Retry'}
      </Typography>
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

  if (status.type === 'running') return <LoadingSkeleton />;

  if (status.type === 'incomplete') {
    return <ErrorBox message={(tu?.failedToLoad ?? 'Failed to load email: {error}').replace('{error}', 'reason' in status ? status.reason : 'unknown')} tu={tu ?? {}} />;
  }
  if (!result) return null;
  if (result.error) {
    return <ErrorBox message={result.error} tu={tu ?? {}} />;
  }

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

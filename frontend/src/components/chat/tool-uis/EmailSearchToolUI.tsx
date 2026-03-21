import { memo } from 'react';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Star, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailSearchResult, EmailSearchItem } from '../types';
import { SenderAvatar } from './shared/SenderAvatar';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function SentimentIndicator({ sentiment, tu }: { sentiment: string | null; tu?: Record<string, string | undefined> }) {
  if (!sentiment) return null;
  const config = sentiment === 'positive'
    ? { color: 'success.main', Icon: TrendingUp, label: tu?.positive ?? 'Positive' }
    : sentiment === 'negative'
      ? { color: 'error.main', Icon: TrendingDown, label: tu?.negative ?? 'Negative' }
      : { color: 'warning.main', Icon: Minus, label: tu?.neutral ?? 'Neutral' };
  return (
    <Box
      component="span"
      title={config.label}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: config.color, flexShrink: 0 }}
    >
      <config.Icon size={10} />
      <Typography component="span" sx={{ fontSize: '0.6rem', fontWeight: 600 }}>{config.label}</Typography>
    </Box>
  );
}

function PriorityBadge({ priority }: { priority: number | null }) {
  if (priority == null || priority < 7) return null;
  return (
    <Box
      component="span"
      sx={{ px: 0.75, py: 0.25, fontSize: '0.625rem', fontWeight: 600, borderRadius: '6px', bgcolor: 'error.light', color: 'error.main' }}
    >
      P{priority}
    </Box>
  );
}

const EmailRow = memo(function EmailRow({ item, isFirst, tu }: { item: EmailSearchItem; isFirst: boolean; tu?: Record<string, string | undefined> }) {
  const isUnread = item.isRead === false;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1,
        py: 1,
        px: 1,
        borderTop: isFirst ? 0 : 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color 0.15s ease',
      }}
    >
      <SenderAvatar name={item.from} size={28} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: sender + badges + date */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: isUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.84rem' }}
          >
            {item.from}
          </Typography>
          {item.isStarred && <Star size={12} style={{ flexShrink: 0, fill: '#ed6c02', color: '#ed6c02' }} />}
          <PriorityBadge priority={item.aiPriority} />
          <SentimentIndicator sentiment={item.aiSentiment} tu={tu} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0, fontSize: '0.72rem' }}>
            {formatDate(item.date ?? item.receivedAt ?? null)}
          </Typography>
        </Box>
        {/* Row 2: subject */}
        <Typography
          variant="body2"
          sx={{ fontWeight: isUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.82rem' }}
        >
          {item.subject ?? tu?.noSubject ?? '(no subject)'}
        </Typography>
        {/* Row 3: snippet */}
        {item.snippet && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mt: 0.25, fontSize: '0.74rem' }}
          >
            {item.snippet}
          </Typography>
        )}
      </Box>
    </Box>
  );
});

function LoadingSkeleton() {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Skeleton width="30%" height={14} sx={{ mb: 1.5 }} />
      {[0, 1, 2].map((i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, py: 0.75, borderTop: i > 0 ? 1 : 0, borderColor: 'divider' }}>
          <Skeleton variant="circular" width={28} height={28} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="90%" height={14} sx={{ mt: 0.5 }} />
            <Skeleton width="50%" height={12} sx={{ mt: 0.25 }} />
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

function ErrorState({ reason, tu }: { reason: string; tu?: Record<string, string | undefined> }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AlertCircle size={16} color="var(--mui-palette-error-main)" />
        <Typography variant="body2" color="error.main" sx={{ flex: 1 }}>
          {(tu?.searchFailed || 'Search failed: {reason}').replace('{reason}', reason)}
        </Typography>
      </Box>
    </Paper>
  );
}

function ResultCard({ result, label, tu }: { result: EmailSearchResult; label: string; tu?: Record<string, string | undefined> }) {
  if (result.error) {
    return <ErrorState reason={result.error} tu={tu} />;
  }
  const items = result.results ?? [];
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', overflow: 'hidden', boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, pt: 1.25, pb: 0.75 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {items.length} result{items.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, px: 1.5, textAlign: 'center' }}>
          {tu?.noEmailsFound || 'No emails found.'}
        </Typography>
      ) : (
        <Box sx={{ px: 0.5 }}>
          {items.map((item, idx) => (
            <EmailRow key={item.id} item={item} isFirst={idx === 0} tu={tu} />
          ))}
        </Box>
      )}
      {result.summary && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
          {result.summary}
        </Typography>
      )}
    </Paper>
  );
}

export function EmailSearchRenderer({
  result,
  status,
}: ToolCallMessagePartProps<
  { query: string; folder?: string; maxResults?: number },
  EmailSearchResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') return <LoadingSkeleton />;
  if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} tu={tu} />;
  if (!result) return null;
  return <ResultCard result={result} label={tu?.emailSearch || 'Email Search'} tu={tu} />;
}

export function ListEmailsRenderer({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { folder?: string; limit?: number; unreadOnly?: boolean },
  EmailSearchResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') return <LoadingSkeleton />;
  if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} tu={tu} />;
  if (!result) return null;
  return <ResultCard result={result} label={args.folder ?? 'Inbox'} tu={tu} />;
}

export function SemanticSearchRenderer({
  result,
  status,
}: ToolCallMessagePartProps<
  { query: string },
  EmailSearchResult
>) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (status.type === 'running') return <LoadingSkeleton />;
  if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} tu={tu} />;
  if (!result) return null;
  return <ResultCard result={result} label={tu?.semanticSearch || 'Semantic Search'} tu={tu} />;
}

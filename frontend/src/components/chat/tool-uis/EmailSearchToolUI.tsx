import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { Search, Mail, Star, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailSearchResult, EmailSearchItem } from '../types';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sentimentDot(sentiment: string | null) {
  if (!sentiment) return null;
  const color =
    sentiment === 'positive'
      ? 'success.main'
      : sentiment === 'negative'
        ? 'error.main'
        : 'warning.main';
  return (
    <Box
      component="span"
      title={sentiment}
      sx={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }}
    />
  );
}

function priorityBadge(priority: number | null) {
  if (priority == null || priority < 7) return null;
  return (
    <Box
      component="span"
      sx={{ px: 0.75, py: 0.25, fontSize: '0.625rem', fontWeight: 600, borderRadius: 0.5, bgcolor: 'error.light', color: 'error.main' }}
    >
      P{priority}
    </Box>
  );
}

function EmailRow({ item, isFirst }: { item: EmailSearchItem; isFirst: boolean }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.75,
        px: 1,
        borderRadius: 1,
        borderTop: isFirst ? 0 : 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        transition: 'background-color 0.15s ease',
      }}
    >
      <Mail size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: item.isRead === false ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {item.from}
          </Typography>
          {item.isStarred && <Star size={12} style={{ flexShrink: 0, fill: 'currentColor', color: '#ed6c02' }} />}
          {priorityBadge(item.aiPriority)}
          {sentimentDot(item.aiSentiment)}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
            {formatDate(item.date ?? item.receivedAt ?? null)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {item.subject ?? '(no subject)'}
        </Typography>
      </Box>
    </Box>
  );
}

function RunningState({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 'fit-content', borderRadius: '10px', border: 1, borderColor: 'divider', bgcolor: 'action.hover', p: 1.5 }}>
      <Search size={16} style={{ opacity: 0.6 }} />
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
  );
}

function ErrorState({ reason }: { reason: string }) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'error.light', bgcolor: 'error.light', opacity: 0.9 }}>
      <AlertCircle size={16} />
      <Typography variant="body2" color="error.main">{(tu?.searchFailed || 'Search failed: {reason}').replace('{reason}', reason)}</Typography>
    </Box>
  );
}

function ResultCard({ result, label }: { result: EmailSearchResult; label: string }) {
  const t = useTranslations();
  const tu = t.ai.toolUi;
  if (result.error) {
    return <ErrorState reason={result.error} />;
  }
  const items = result.results ?? [];
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {items.length} result{items.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{tu?.noEmailsFound || 'No emails found.'}</Typography>
      ) : (
        <Box>
          {items.map((item, idx) => (
            <EmailRow key={item.id} item={item} isFirst={idx === 0} />
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
}

export function EmailSearchRenderer({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { query: string; folder?: string; maxResults?: number },
  EmailSearchResult
>) {
  const t = useTranslations();
  if (status.type === 'running') return <RunningState label={`Searching "${args.query}"...`} />;
  if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
  if (!result) return null;
  return <ResultCard result={result} label={t.ai.toolUi?.emailSearch || 'Email Search'} />;
}

export function ListEmailsRenderer({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { folder?: string; limit?: number; unreadOnly?: boolean },
  EmailSearchResult
>) {
  if (status.type === 'running') return <RunningState label={`Loading emails${args.folder ? ` from ${args.folder}` : ''}...`} />;
  if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
  if (!result) return null;
  return <ResultCard result={result} label={args.folder ?? 'Inbox'} />;
}

export function SemanticSearchRenderer({
  args,
  result,
  status,
}: ToolCallMessagePartProps<
  { query: string },
  EmailSearchResult
>) {
  const t = useTranslations();
  if (status.type === 'running') return <RunningState label={`Semantic search "${args.query}"...`} />;
  if (status.type === 'incomplete') return <ErrorState reason={'reason' in status ? status.reason : 'unknown'} />;
  if (!result) return null;
  return <ResultCard result={result} label={t.ai.toolUi?.semanticSearch || 'Semantic Search'} />;
}

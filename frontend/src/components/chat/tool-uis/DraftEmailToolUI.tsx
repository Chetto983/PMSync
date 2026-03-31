import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { useRouter } from 'next/router';
import { FileEdit, ExternalLink, AlertCircle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailUIStore } from '@/stores/email-ui-store';

interface DraftEmailArgs {
  to: string;
  subject: string;
  body: string;
}

interface DraftEmailResult {
  id?: string;
  subject?: string;
  to?: string;
  status?: string;
  error?: string;
}

function LoadingSkeleton({ tu }: { tu: Record<string, string | undefined> }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, boxShadow: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <FileEdit size={16} style={{ opacity: 0.6 }} />
        <Typography variant="body2" color="text.secondary">{tu.creatingDraft ?? 'Creating draft...'}</Typography>
      </Box>
      <Skeleton width="60%" height={16} />
      <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
    </Paper>
  );
}

export function DraftEmailRenderer({
  args,
  result,
  status,
}: ToolCallMessagePartProps<DraftEmailArgs, DraftEmailResult>) {
  const router = useRouter();
  const t = useTranslations();
  const tu = t.ai.toolUi ?? {};
  const openDraft = useEmailUIStore((s) => s.openDraft);

  if (status.type === 'running') return <LoadingSkeleton tu={tu} />;

  if (status.type === 'incomplete') {
    const reason = 'reason' in status ? status.reason : 'unknown';
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={16} color="var(--mui-palette-error-main)" />
          <Typography variant="body2" color="error.main">
            {(tu.draftFailed ?? 'Failed to create draft: {error}').replace('{error}', reason)}
          </Typography>
        </Box>
      </Paper>
    );
  }

  if (!result) return null;

  if (result.error) {
    return (
      <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, borderColor: 'error.light' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertCircle size={16} color="var(--mui-palette-error-main)" />
          <Typography variant="body2" color="error.main">{result.error}</Typography>
        </Box>
      </Paper>
    );
  }

  const handleOpen = () => {
    if (result.id) {
      openDraft(result.id);
      void router.push(`/dashboard/email/compose?draftId=${encodeURIComponent(result.id)}`);
    }
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: '10px', overflow: 'hidden', boxShadow: 1 }}>
      {/* Success header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1.25, pb: 0.75, bgcolor: 'success.light', borderBottom: 1, borderColor: 'divider' }}>
        <FileEdit size={16} color="var(--mui-palette-success-dark)" />
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'success.dark', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {tu.draftSaved ?? 'Draft saved'}
        </Typography>
      </Box>

      {/* Draft details */}
      <Box sx={{ px: 1.5, py: 1.25 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
          {result.subject ?? args.subject}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {(tu.to ?? 'To: {value}').replace('{value}', result.to ?? args.to)}
        </Typography>
      </Box>

      {/* Open in editor button */}
      {result.id && (
        <Box sx={{ px: 1.5, pb: 1.25 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ExternalLink size={14} />}
            onClick={handleOpen}
            sx={{ textTransform: 'none', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            {tu.openInEditor ?? 'Open in editor'}
          </Button>
        </Box>
      )}
    </Paper>
  );
}

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Fade from '@mui/material/Fade';
import { Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface AiDraftBadgeProps {
  visible: boolean;
  onRestore?: () => void;
  showRestore?: boolean;
}

export function AiDraftBadge({ visible, onRestore, showRestore }: AiDraftBadgeProps) {
  const t = useTranslations();

  // Fade needs a single child element; render nothing when not visible AND not showing restore
  if (!visible && !showRestore) return null;

  return (
    <Fade in={visible || showRestore}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        {visible && (
          <Chip
            icon={<Sparkles size={14} />}
            label={t.email.aiDraft.badge}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 24, fontSize: '0.75rem' }}
          />
        )}
        {showRestore && onRestore && (
          <Typography
            variant="caption"
            color="primary"
            sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            onClick={onRestore}
          >
            {t.email.aiDraft.restore}
          </Typography>
        )}
      </Box>
    </Fade>
  );
}

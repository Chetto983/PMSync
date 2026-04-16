'use client';

import { Chip, alpha } from '@mui/material';
import { Mail, User, Building2, Calendar, Sparkles } from 'lucide-react';
import { usePageContext, type PageContextType } from '@/hooks/use-page-context';
import { useTranslations } from '@/lib/hooks/use-translations';

const CONTEXT_CONFIG: Record<PageContextType, { icon: typeof Mail; color: string }> = {
  email: { icon: Mail, color: '#00aced' },
  contact: { icon: User, color: '#7650ce' },
  deal: { icon: Building2, color: '#22c55e' },
  calendar: { icon: Calendar, color: '#FF9800' },
  general: { icon: Sparkles, color: 'inherit' },
};

function resolveLabel(
  type: PageContextType,
  label: string,
  context: Record<string, string>,
): string {
  if (type === 'general') return context.general;
  const placeholder = label || '...';
  return (context[type] || '').replace(/\{[^}]+\}/, placeholder);
}

/**
 * Compact indicator showing detected page context (entity type icon + label).
 * Renders a MUI Chip with semantic color per context type.
 */
export function ContextIndicator() {
  const { type, label } = usePageContext();
  const t = useTranslations();

  const config = CONTEXT_CONFIG[type];
  const IconComponent = config.icon;

  const displayLabel = resolveLabel(type, label, t.ai.overlay.context);

  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<IconComponent size={14} />}
      label={displayLabel}
      sx={{
        maxWidth: 220,
        '& .MuiChip-label': {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
        borderColor:
          config.color === 'inherit'
            ? 'divider'
            : alpha(config.color, 0.4),
        '& .MuiChip-icon': {
          color:
            config.color === 'inherit' ? 'text.secondary' : config.color,
        },
      }}
    />
  );
}

'use client';

import React, { useMemo } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import StarIcon from '@mui/icons-material/Star';
import { useTemplates } from '@/hooks/queries/use-templates';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { EmailTemplate } from '@/lib/api/templates';

interface TemplatePickerProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onSelect: (template: { subject: string; bodyHtml: string }) => void;
}

/** Group templates by category, with uncategorized last. */
function groupByCategory(
  templates: EmailTemplate[],
): Map<string, EmailTemplate[]> {
  const grouped = new Map<string, EmailTemplate[]>();
  const uncategorizedKey = '__uncategorized__';

  for (const tpl of templates) {
    const key = tpl.category ?? uncategorizedKey;
    const list = grouped.get(key);
    if (list) {
      list.push(tpl);
    } else {
      grouped.set(key, [tpl]);
    }
  }

  // Move uncategorized to the end if present
  const uncategorized = grouped.get(uncategorizedKey);
  if (uncategorized) {
    grouped.delete(uncategorizedKey);
    grouped.set(uncategorizedKey, uncategorized);
  }

  return grouped;
}

export default function TemplatePicker({
  anchorEl,
  open,
  onClose,
  onSelect,
}: TemplatePickerProps) {
  const t = useTranslations();
  const { data, isLoading } = useTemplates();

  const templates = data?.templates ?? [];

  const grouped = useMemo(() => groupByCategory(templates), [templates]);

  const handleSelect = (tpl: EmailTemplate) => {
    onSelect({ subject: tpl.subject, bodyHtml: tpl.bodyHtml });
    onClose();
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3, px: 4 }}>
          <CircularProgress size={24} />
        </Box>
      );
    }

    if (templates.length === 0) {
      return (
        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t.email.templates.noTemplates}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
            {t.email.templates.noTemplatesHint}
          </Typography>
        </Box>
      );
    }

    const items: React.ReactNode[] = [];
    const hasMultipleGroups = grouped.size > 1 || !grouped.has('__uncategorized__');

    for (const [category, categoryTemplates] of grouped) {
      if (hasMultipleGroups) {
        const label =
          category === '__uncategorized__'
            ? 'Other'
            : category;
        items.push(
          <ListSubheader key={`header-${category}`} sx={{ lineHeight: '32px' }}>
            {label}
          </ListSubheader>,
        );
      }

      for (const tpl of categoryTemplates) {
        items.push(
          <MenuItem
            key={tpl.id}
            onClick={() => handleSelect(tpl)}
            sx={{ py: 1 }}
          >
            {tpl.isDefault && (
              <ListItemIcon sx={{ minWidth: 32 }}>
                <StarIcon fontSize="small" color="warning" />
              </ListItemIcon>
            )}
            <ListItemText
              inset={!tpl.isDefault}
              primary={tpl.name}
              secondary={tpl.subject}
              secondaryTypographyProps={{
                noWrap: true,
                sx: { maxWidth: 260 },
              }}
            />
          </MenuItem>,
        );
      }
    }

    return items;
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            minWidth: 280,
            maxWidth: 400,
            maxHeight: 360,
          },
        },
      }}
    >
      {renderContent()}
    </Menu>
  );
}

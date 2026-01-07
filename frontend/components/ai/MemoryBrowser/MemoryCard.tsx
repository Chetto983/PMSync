'use client';

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import { Trash2, Copy, Check, Brain, Lightbulb, TrendingUp, MessageSquare, Users } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { Memory, MemoryType } from '@/hooks/queries';

interface MemoryCardProps {
  memory: Memory;
  onDelete?: (id: string) => void;
  onShowHistory?: (id: string) => void;
  isDeleting?: boolean;
}

const MEMORY_TYPE_ICONS: Record<MemoryType, React.ReactNode> = {
  PREFERENCE: <Lightbulb size={16} />,
  FACT: <Brain size={16} />,
  PATTERN: <TrendingUp size={16} />,
  INTERACTION: <MessageSquare size={16} />,
  CONTACT_NOTE: <Users size={16} />,
};

const MEMORY_TYPE_COLORS: Record<MemoryType, string> = {
  PREFERENCE: 'primary',
  FACT: 'info',
  PATTERN: 'success',
  INTERACTION: 'warning',
  CONTACT_NOTE: 'secondary',
};

export function MemoryCard({ memory, onDelete, isDeleting, onShowHistory }: MemoryCardProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(memory.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(memory.id);
    }
  };

  // Handle missing or invalid memory type (backend uses memoryType field)
  const memType = memory.memoryType && MEMORY_TYPE_ICONS[memory.memoryType] ? memory.memoryType : 'PREFERENCE';
  const categoryLabel = t.ai.memoryBrowser.categories[memType] || memType;
  const colorKey = MEMORY_TYPE_COLORS[memType] as 'primary' | 'info' | 'success' | 'warning' | 'secondary';
  const color = theme.palette[colorKey]?.main || theme.palette.primary.main;

  // Handle missing or invalid date
  const dateValue = memory.updatedAt || memory.createdAt;
  const parsedDate = dateValue ? new Date(dateValue) : null;
  const isValidDate = parsedDate && !isNaN(parsedDate.getTime());
  const formattedDate = isValidDate
    ? parsedDate.toLocaleDateString(t.locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : new Date().toLocaleDateString(t.locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <Card
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.1),
        borderRadius: 3,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: alpha(color, 0.3),
          boxShadow: `0 4px 12px ${alpha(theme.palette.common.black, 0.06)}`,
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              icon={<Box sx={{ display: 'flex', color: 'inherit' }}>{MEMORY_TYPE_ICONS[memType]}</Box>}
              label={categoryLabel}
              sx={{
                bgcolor: alpha(color, 0.1),
                color: color,
                fontWeight: 500,
                fontSize: '0.7rem',
                height: 24,
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {formattedDate}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {onShowHistory && (
              <Tooltip title={t.ai.memoryBrowser.actions.showHistory}>
                <IconButton
                  size="small"
                  onClick={() => onShowHistory(memory.id)}
                  sx={{ opacity: 0.6, '&:hover': { opacity: 1, color: 'info.main' } }}
                >
                  <TrendingUp size={14} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={copied ? t.ai.memoryBrowser.actions.copied : t.ai.memoryBrowser.actions.copy}>
              <IconButton size="small" onClick={handleCopy} sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
            </Tooltip>
            <Tooltip title={t.ai.memoryBrowser.actions.delete}>
              <IconButton
                size="small"
                onClick={handleDelete}
                disabled={isDeleting}
                sx={{
                  opacity: 0.6,
                  '&:hover': { opacity: 1, color: 'error.main' },
                }}
              >
                <Trash2 size={14} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Content */}
        <Typography
          variant="body2"
          sx={{
            color: 'text.primary',
            lineHeight: 1.6,
            wordBreak: 'break-word',
          }}
        >
          {memory.content}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default MemoryCard;

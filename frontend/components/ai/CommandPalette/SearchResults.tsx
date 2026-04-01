'use client';

import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
  Box,
  CircularProgress,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { SearchResult, SearchResultGroup } from './types';

interface SearchResultsProps {
  groups: SearchResultGroup[];
  isSearching: boolean;
  hasError: boolean;
  focusedIndex: number;
  onSelect: (result: SearchResult) => void;
  commandCount: number;
  listRef: React.RefObject<HTMLUListElement | null>;
}

function getEntityColor(type: SearchResult['type'], theme: ReturnType<typeof useTheme>): string {
  switch (type) {
    case 'email': return theme.palette.primary.main;
    case 'contact': return theme.palette.secondary.main;
    case 'deal': return theme.palette.success.main;
    case 'ticket': return theme.palette.warning.main;
    case 'kb': return theme.palette.secondary.main;
    default: return theme.palette.text.secondary;
  }
}

export function SearchResults({
  groups,
  isSearching,
  hasError,
  focusedIndex,
  onSelect,
  commandCount,
  listRef,
}: SearchResultsProps) {
  const t = useTranslations();
  const theme = useTheme();

  // Loading state
  if (isSearching && groups.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={20} sx={{ mr: 1 }} />
        <Typography variant="body2" color="text.secondary">
          {t.commandPalette.searching}
        </Typography>
      </Box>
    );
  }

  // Error state
  if (hasError && groups.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
        {t.commandPalette.searchError}
      </Typography>
    );
  }

  // Empty state
  if (groups.length === 0 && !isSearching && !hasError) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
        {t.commandPalette.noResults}
      </Typography>
    );
  }

  let flatIndex = 0;

  return (
    <List
      dense
      ref={listRef}
      sx={{ maxHeight: 240, overflow: 'auto', py: 1, px: 1 }}
    >
      {groups.map((group) => (
        <li key={group.type}>
          <ListSubheader
            sx={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              lineHeight: '28px',
              textTransform: 'uppercase',
              bgcolor: 'transparent',
            }}
          >
            {group.label}
          </ListSubheader>
          {group.results.map((result) => {
            const currentGlobalIndex = commandCount + flatIndex++;
            const chipColor = getEntityColor(result.type, theme);

            return (
              <ListItemButton
                key={result.id}
                selected={currentGlobalIndex === focusedIndex}
                data-command-item
                onClick={() => onSelect(result)}
                sx={{ borderRadius: 2, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <result.icon size={18} />
                </ListItemIcon>
                <ListItemText
                  primary={result.title}
                  secondary={result.subtitle}
                  primaryTypographyProps={{ noWrap: true, fontSize: '0.875rem' }}
                  secondaryTypographyProps={{ noWrap: true, fontSize: '0.75rem' }}
                />
                <Chip
                  label={result.type}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: '0.7rem',
                    height: 20,
                    textTransform: 'capitalize',
                    fontWeight: 400,
                    borderColor: chipColor,
                    color: chipColor,
                    ml: 1,
                    flexShrink: 0,
                  }}
                />
              </ListItemButton>
            );
          })}
        </li>
      ))}
    </List>
  );
}

'use client';

import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Box,
  alpha,
} from '@mui/material';
import type { CommandItem } from './types';
import { GROUP_ORDER } from './commands';

interface CommandListProps {
  commands: CommandItem[];
  focusedIndex: number;
  onSelect: (command: CommandItem) => void;
  groupLabels: Record<string, string>;
  listRef: React.RefObject<HTMLUListElement | null>;
}

export function CommandList({
  commands,
  focusedIndex,
  onSelect,
  groupLabels,
  listRef,
}: CommandListProps) {
  // Group commands by group key
  const grouped = commands.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {});

  // Render in GROUP_ORDER, skip empty groups
  let flatIndex = 0;

  return (
    <List
      dense
      ref={listRef}
      sx={{ maxHeight: 320, overflow: 'auto', py: 1, px: 1 }}
    >
      {GROUP_ORDER.map((groupKey) => {
        const items = grouped[groupKey];
        if (!items || items.length === 0) return null;

        const label = groupLabels[groupKey] || groupKey;

        return (
          <li key={groupKey}>
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
              {label}
            </ListSubheader>
            {items.map((cmd) => {
              const currentIndex = flatIndex++;
              return (
                <ListItemButton
                  key={cmd.id}
                  selected={currentIndex === focusedIndex}
                  onClick={() => onSelect(cmd)}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <cmd.icon size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={cmd.name}
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                  />
                  {cmd.shortcut && (
                    <Box
                      sx={{
                        bgcolor: (theme) =>
                          alpha(theme.palette.text.primary, 0.06),
                        borderRadius: 1,
                        px: 0.75,
                        py: 0.25,
                        fontSize: '0.7rem',
                        ml: 1,
                        flexShrink: 0,
                      }}
                    >
                      {cmd.shortcut}
                    </Box>
                  )}
                </ListItemButton>
              );
            })}
          </li>
        );
      })}
    </List>
  );
}

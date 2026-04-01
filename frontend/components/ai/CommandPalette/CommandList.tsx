import { Box, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, alpha } from '@mui/material';
import type { CommandItem, CommandGroup } from './types';
import { GROUP_ORDER } from './commands';

interface CommandListProps {
  commands: CommandItem[];
  focusedIndex: number;
  onSelect: (command: CommandItem) => void;
  groupLabels: Record<CommandGroup, string>;
}

export function CommandList({
  commands,
  focusedIndex,
  onSelect,
  groupLabels,
}: CommandListProps) {
  const grouped = commands.reduce<Record<CommandGroup, CommandItem[]>>((acc, command) => {
    acc[command.group].push(command);
    return acc;
  }, {
    navigation: [],
    crm: [],
    actions: [],
    ai: [],
    productivity: [],
    system: [],
  });

  let flatIndex = 0;

  return (
    <List dense disablePadding sx={{ py: 1, px: 1 }}>
      {GROUP_ORDER.map((group) => {
        const groupCommands = grouped[group];
        if (!groupCommands.length) return null;

        return (
          <Box key={group}>
            <ListSubheader
              disableGutters
              sx={{
                lineHeight: '28px',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                bgcolor: 'transparent',
                px: 1,
              }}
            >
              {groupLabels[group]}
            </ListSubheader>

            {groupCommands.map((command) => {
              const selected = focusedIndex === flatIndex;
              flatIndex += 1;

              return (
                <ListItemButton
                  key={command.id}
                  selected={selected}
                  data-command-item
                  data-focused={selected ? 'true' : 'false'}
                  onClick={() => onSelect(command)}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <command.icon size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={command.name}
                    primaryTypographyProps={{ fontSize: '0.875rem' }}
                  />
                  {command.shortcut ? (
                    <Box
                      component="kbd"
                      sx={{
                        ml: 'auto',
                        bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06),
                        borderRadius: 1,
                        px: 0.75,
                        py: 0.25,
                        fontSize: '0.7rem',
                        fontFamily: 'inherit',
                        color: 'text.secondary',
                        border: 'none',
                      }}
                    >
                      {command.shortcut}
                    </Box>
                  ) : null}
                </ListItemButton>
              );
            })}
          </Box>
        );
      })}
    </List>
  );
}

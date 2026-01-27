/**
 * CommandPalette - Quick command modal like Claude Code's "/" commands
 *
 * Features:
 * - Triggered by "/" at start of input
 * - Fuzzy search filtering
 * - Keyboard navigation (↑↓ Enter Esc)
 * - Category groupings (Email, Calendar, Contacts, AI)
 * - Glassmorphism design matching existing UI
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Dialog,
  Box,
  TextField,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  InputAdornment,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Search,
  Calendar,
  Users,
  Sparkles,
  FileText,
  Bell,
  Send,
  BarChart3,
  Clock,
  UserPlus,
  Inbox,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface Command {
  key: string;
  category: 'email' | 'calendar' | 'contacts' | 'ai';
  label: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
}

const COMMANDS: Command[] = [
  // Email commands
  { key: 'search', category: 'email', label: '/search', description: 'Search emails', prompt: 'Search my emails for ', icon: Search },
  { key: 'unread', category: 'email', label: '/unread', description: 'Unread count', prompt: 'How many unread emails do I have?', icon: Inbox },
  { key: 'summarize', category: 'email', label: '/summarize', description: 'Summarize inbox', prompt: 'Summarize my inbox', icon: FileText },
  { key: 'important', category: 'email', label: '/important', description: 'Important emails', prompt: 'Show me important emails from today', icon: Star },

  // Calendar commands
  { key: 'events', category: 'calendar', label: '/events', description: "Today's events", prompt: 'What events do I have today?', icon: Calendar },
  { key: 'schedule', category: 'calendar', label: '/schedule', description: 'Schedule meeting', prompt: 'Schedule a meeting ', icon: Clock },
  { key: 'week', category: 'calendar', label: '/week', description: 'This week', prompt: "What's on my calendar this week?", icon: Calendar },

  // Contacts commands
  { key: 'find', category: 'contacts', label: '/find', description: 'Find contact', prompt: 'Find contact ', icon: Users },
  { key: 'add', category: 'contacts', label: '/add', description: 'Add contact', prompt: 'Add a new contact ', icon: UserPlus },

  // AI commands
  { key: 'draft', category: 'ai', label: '/draft', description: 'Draft email', prompt: 'Draft an email to ', icon: Send },
  { key: 'followup', category: 'ai', label: '/followup', description: 'Follow-ups', prompt: 'Show my pending follow-ups', icon: Bell },
  { key: 'briefing', category: 'ai', label: '/briefing', description: 'Daily briefing', prompt: 'Give me my daily briefing', icon: Sparkles },
  { key: 'analytics', category: 'ai', label: '/analytics', description: 'Email analytics', prompt: 'Show my email analytics', icon: BarChart3 },
];

const CATEGORY_LABELS: Record<Command['category'], string> = {
  email: 'Email',
  calendar: 'Calendar',
  contacts: 'Contacts',
  ai: 'AI',
};

const CATEGORY_COLORS: Record<Command['category'], string> = {
  email: 'primary',
  calendar: 'warning',
  contacts: 'success',
  ai: 'secondary',
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelectCommand: (prompt: string) => void;
  initialFilter?: string;
}

export function CommandPalette({ open, onClose, onSelectCommand, initialFilter = '' }: CommandPaletteProps) {
  const theme = useTheme();
  const t = useTranslations();
  const [filter, setFilter] = useState(initialFilter);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter commands based on input
  const filteredCommands = useMemo(() => {
    if (!filter) return COMMANDS;
    const lowerFilter = filter.toLowerCase().replace('/', '');
    return COMMANDS.filter(
      (cmd) =>
        cmd.key.includes(lowerFilter) ||
        cmd.label.includes(lowerFilter) ||
        cmd.description.toLowerCase().includes(lowerFilter) ||
        cmd.category.includes(lowerFilter)
    );
  }, [filter]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Flat list for keyboard navigation
  const flatCommands = useMemo(() => {
    const result: Command[] = [];
    for (const category of ['email', 'calendar', 'contacts', 'ai'] as const) {
      if (groupedCommands[category]) {
        result.push(...groupedCommands[category]);
      }
    }
    return result;
  }, [groupedCommands]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setFilter(initialFilter);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, initialFilter]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && flatCommands.length > 0) {
      const selectedItem = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, flatCommands.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % flatCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + flatCommands.length) % flatCommands.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (flatCommands[selectedIndex]) {
            onSelectCommand(flatCommands[selectedIndex].prompt);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            setSelectedIndex((prev) => (prev - 1 + flatCommands.length) % flatCommands.length);
          } else {
            setSelectedIndex((prev) => (prev + 1) % flatCommands.length);
          }
          break;
      }
    },
    [flatCommands, selectedIndex, onSelectCommand, onClose]
  );

  const handleSelectCommand = useCallback(
    (cmd: Command) => {
      onSelectCommand(cmd.prompt);
      onClose();
    },
    [onSelectCommand, onClose]
  );

  // Get translations with fallbacks
  const labels = {
    title: t.ai?.commandPalette?.title || 'Quick Commands',
    placeholder: t.ai?.commandPalette?.placeholder || 'Type a command...',
    noResults: t.ai?.commandPalette?.noResults || 'No commands found',
    hint: t.ai?.commandPalette?.hint || 'Use ↑↓ to navigate, Enter to select, Esc to close',
  };

  let currentFlatIndex = 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: alpha(theme.palette.background.paper, 0.95),
          backdropFilter: 'blur(20px)',
          borderRadius: 3,
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          boxShadow: `0 25px 50px -12px ${alpha(theme.palette.common.black, 0.25)}`,
          maxHeight: '70vh',
          overflow: 'hidden',
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            bgcolor: alpha(theme.palette.common.black, 0.5),
            backdropFilter: 'blur(4px)',
          },
        },
      }}
    >
      <Box sx={{ p: 2, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}` }}>
        <TextField
          ref={inputRef}
          inputRef={inputRef}
          fullWidth
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={labels.placeholder}
          autoFocus
          variant="standard"
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <Box component="span" sx={{ display: 'flex', color: 'text.secondary' }}>
                  <Search size={20} />
                </Box>
              </InputAdornment>
            ),
            sx: {
              fontSize: '1.1rem',
              py: 1,
            },
          }}
        />
      </Box>

      <Box sx={{ overflow: 'auto', maxHeight: 'calc(70vh - 120px)' }}>
        {flatCommands.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">{labels.noResults}</Typography>
          </Box>
        ) : (
          <List ref={listRef} sx={{ py: 1 }}>
            {(['email', 'calendar', 'contacts', 'ai'] as const).map((category) => {
              const commands = groupedCommands[category];
              if (!commands || commands.length === 0) return null;

              return (
                <Box key={category}>
                  <Typography
                    variant="overline"
                    sx={{
                      px: 2,
                      py: 1,
                      display: 'block',
                      color: 'text.secondary',
                      fontWeight: 600,
                    }}
                  >
                    {CATEGORY_LABELS[category]}
                  </Typography>
                  {commands.map((cmd) => {
                    const flatIndex = currentFlatIndex++;
                    const isSelected = flatIndex === selectedIndex;
                    const Icon = cmd.icon;

                    return (
                      <ListItemButton
                        key={cmd.key}
                        data-index={flatIndex}
                        selected={isSelected}
                        onClick={() => handleSelectCommand(cmd)}
                        sx={{
                          mx: 1,
                          borderRadius: 2,
                          mb: 0.5,
                          '&.Mui-selected': {
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            '&:hover': {
                              bgcolor: alpha(theme.palette.primary.main, 0.15),
                            },
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                          <Icon size={18} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography
                                component="span"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.9rem',
                                  color: 'primary.main',
                                  fontWeight: 600,
                                }}
                              >
                                {cmd.label}
                              </Typography>
                              <Typography
                                component="span"
                                variant="body2"
                                color="text.primary"
                              >
                                {cmd.description}
                              </Typography>
                            </Box>
                          }
                        />
                        <Chip
                          label={CATEGORY_LABELS[cmd.category]}
                          size="small"
                          color={CATEGORY_COLORS[cmd.category] as 'primary' | 'warning' | 'success' | 'secondary'}
                          variant="outlined"
                          sx={{ ml: 1, height: 22, fontSize: '0.7rem' }}
                        />
                      </ListItemButton>
                    );
                  })}
                </Box>
              );
            })}
          </List>
        )}
      </Box>

      <Box
        sx={{
          p: 1.5,
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          display: 'flex',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          <Box
            component="kbd"
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: alpha(theme.palette.text.primary, 0.1),
              fontFamily: 'monospace',
            }}
          >
            ↑↓
          </Box>{' '}
          navigate
        </Typography>
        <Typography variant="caption" color="text.secondary">
          <Box
            component="kbd"
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: alpha(theme.palette.text.primary, 0.1),
              fontFamily: 'monospace',
            }}
          >
            Enter
          </Box>{' '}
          select
        </Typography>
        <Typography variant="caption" color="text.secondary">
          <Box
            component="kbd"
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 0.5,
              bgcolor: alpha(theme.palette.text.primary, 0.1),
              fontFamily: 'monospace',
            }}
          >
            Esc
          </Box>{' '}
          close
        </Typography>
      </Box>
    </Dialog>
  );
}

export default CommandPalette;

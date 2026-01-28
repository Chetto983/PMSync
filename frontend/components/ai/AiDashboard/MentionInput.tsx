'use client';

/**
 * MentionInput - Superhuman-style Input with @ and # Autocomplete
 *
 * Features:
 * - @ mentions for contacts (shows autocomplete with contact search)
 * - # mentions for email providers/accounts (shows account picker)
 * - Inline autocomplete dropdown
 * - Keyboard navigation (up/down/enter/escape)
 *
 * @see Superhuman's command palette UX for inspiration
 */

import React, { useState, useRef, useCallback, type KeyboardEvent } from 'react';
import {
  Box,
  TextField,
  Paper,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Avatar,
  Chip,
  alpha,
  useTheme,
  CircularProgress,
  Popper,
  ClickAwayListener,
} from '@mui/material';
import { User, Mail, AtSign, Hash, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { contactsApi } from '@/lib/api/contacts';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { useTranslations } from '@/lib/hooks/use-translations';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

type MentionType = 'contact' | 'provider' | null;

interface MentionState {
  type: MentionType;
  query: string;
  startIndex: number;
}

// Provider type icons
const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  google: <Mail size={18} style={{ color: '#EA4335' }} />,
  microsoft: <Mail size={18} style={{ color: '#00A4EF' }} />,
  generic: <Mail size={18} />,
};

export function MentionInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  inputRef: externalInputRef,
}: MentionInputProps) {
  const theme = useTheme();
  const t = useTranslations();
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const anchorRef = useRef<HTMLDivElement>(null);

  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [popperOpen, setPopperOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);

  // PERF FIX: Debounce search query to avoid API call on every keystroke
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Update debounced query with 300ms delay
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(mentionState?.query || '');
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mentionState?.query]);

  // Callback ref to set anchor element
  const setAnchorRef = useCallback((node: HTMLDivElement | null) => {
    anchorRef.current = node;
    setAnchorEl(node);
  }, []);

  // Contact search query - DEBOUNCED to avoid API spam
  // PERF FIX 2026-01-28: Uses debouncedQuery (300ms delay) instead of instant query
  const {
    data: contactsData,
    isLoading: contactsLoading,
  } = useQuery({
    queryKey: ['contacts', 'mention-search', debouncedQuery],
    queryFn: async () => {
      if (mentionState?.type !== 'contact') return { contacts: [] };
      // Reduced limit from 100 to 20 for faster response
      return await contactsApi.listContacts({
        search: debouncedQuery || undefined,
        limit: 20
      });
    },
    enabled: mentionState?.type === 'contact' && debouncedQuery.length >= 0,
    staleTime: 60 * 1000, // Cache for 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache 5 minutes
  });

  // Providers query
  const {
    data: providers,
    isLoading: providersLoading,
  } = useQuery({
    queryKey: ['providers', 'mention-list'],
    queryFn: async () => providersApi.getProviders(),
    enabled: mentionState?.type === 'provider',
    staleTime: 5 * 60 * 1000,
  });

  // Filter contacts to only include those with valid email addresses, limit to 8 for display
  const contacts = (contactsData?.contacts || [])
    .filter((contact) => {
      if (!Array.isArray(contact.emails) || contact.emails.length === 0) {
        return false;
      }
      // Check if at least one email has a valid value
      return contact.emails.some((email) => {
        return email?.value && email.value.includes('@');
      });
    })
    .slice(0, 8); // Limit to 8 for dropdown display
  const isLoading = contactsLoading || providersLoading;

  // Filter providers by query
  const filteredProviders = (providers || []).filter((p: ProviderConfig) => {
    if (!mentionState?.query) return true;
    const q = mentionState.query.toLowerCase();
    return (
      p.email.toLowerCase().includes(q) ||
      p.displayName?.toLowerCase().includes(q) ||
      p.scope?.toLowerCase().includes(q) ||
      p.providerType.toLowerCase().includes(q)
    );
  });

  // Items to show in dropdown
  const items = mentionState?.type === 'contact'
    ? contacts.map((c) => ({
        id: c.id,
        primary: c.displayName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unknown',
        secondary: Array.isArray(c.emails) && c.emails.length > 0
          ? (c.emails[0] as { value?: string })?.value || ''
          : '',
        icon: c.company ? <Building2 size={18} /> : <User size={18} />,
        type: 'contact' as const,
        data: c,
      }))
    : filteredProviders.map((p: ProviderConfig) => ({
        id: p.id,
        primary: p.displayName || p.email,
        secondary: `${p.scope || p.providerType} • ${p.email}`,
        icon: PROVIDER_ICONS[p.providerType] || <Mail size={18} />,
        type: 'provider' as const,
        data: p,
      }));

  // Detect @ or # triggers
  const detectMention = useCallback((text: string, cursorPos: number) => {
    // Find the last @ or # before cursor
    let mentionStart = -1;
    let mentionType: MentionType = null;

    for (let i = cursorPos - 1; i >= 0; i--) {
      const char = text[i];
      // Stop if we hit a space (not inside a mention)
      if (char === ' ' || char === '\n') break;
      if (char === '@') {
        mentionStart = i;
        mentionType = 'contact';
        break;
      }
      if (char === '#') {
        mentionStart = i;
        mentionType = 'provider';
        break;
      }
    }

    if (mentionStart >= 0 && mentionType) {
      const query = text.slice(mentionStart + 1, cursorPos);
      return { type: mentionType, query, startIndex: mentionStart };
    }
    return null;
  }, []);

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    onChange(newValue);

    const mention = detectMention(newValue, cursorPos);
    setMentionState(mention);
    setPopperOpen(!!mention);
    setSelectedIndex(0);
  };

  // Clamp selected index to valid range (avoid useEffect to prevent cascading renders)
  const clampedSelectedIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0;

  // Handle item selection
  const handleSelectItem = useCallback((item: typeof items[0]) => {
    if (!mentionState) return;

    let insertText = '';
    if (item.type === 'contact') {
      // Insert email address for contacts
      insertText = item.secondary || item.primary;
    } else {
      // Insert provider display with ID for providers
      insertText = `[${item.primary}]`;
    }

    // Replace the @query or #query with the selected item
    const beforeMention = value.slice(0, mentionState.startIndex);
    const cursorPos = inputRef.current?.selectionStart || value.length;
    const afterMention = value.slice(cursorPos);

    const newValue = `${beforeMention}${insertText} ${afterMention}`;
    onChange(newValue);

    // Close dropdown
    setMentionState(null);
    setPopperOpen(false);
    setSelectedIndex(0);

    // Focus back on input
    setTimeout(() => {
      inputRef.current?.focus();
      const newCursorPos = beforeMention.length + insertText.length + 1;
      inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [mentionState, value, onChange, inputRef]);

  // Keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!popperOpen || items.length === 0) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % items.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (items[clampedSelectedIndex]) {
          handleSelectItem(items[clampedSelectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setPopperOpen(false);
        setMentionState(null);
        break;
      case 'Tab':
        if (items[clampedSelectedIndex]) {
          e.preventDefault();
          handleSelectItem(items[clampedSelectedIndex]);
        }
        break;
    }
  };

  // Close on click away
  const handleClickAway = () => {
    setPopperOpen(false);
    setMentionState(null);
  };

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box ref={setAnchorRef} sx={{ position: 'relative', width: '100%' }}>
        <TextField
          fullWidth
          placeholder={placeholder || t.ai?.inputPlaceholder || 'Type @ for contacts, # for accounts...'}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          multiline
          maxRows={4}
          inputRef={inputRef}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: alpha(theme.palette.background.paper, 0.8),
              backdropFilter: 'blur(10px)',
              border: '1px solid',
              borderColor: alpha(theme.palette.divider, 0.1),
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: alpha(theme.palette.primary.main, 0.3),
              },
              '&.Mui-focused': {
                borderColor: alpha(theme.palette.primary.main, 0.5),
                boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`,
              },
              '& fieldset': {
                border: 'none',
              },
            },
          }}
        />

        {/* Hint chips */}
        {!value && !disabled && (
          <Box
            sx={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              gap: 0.5,
              pointerEvents: 'none',
            }}
          >
            <Chip
              icon={<AtSign size={12} />}
              label={t.ai?.mentions?.contacts || 'contacts'}
              size="small"
              variant="outlined"
              sx={{
                height: 22,
                fontSize: '0.65rem',
                opacity: 0.5,
                '& .MuiChip-icon': { fontSize: 12 },
              }}
            />
            <Chip
              icon={<Hash size={12} />}
              label={t.ai?.mentions?.accounts || 'accounts'}
              size="small"
              variant="outlined"
              sx={{
                height: 22,
                fontSize: '0.65rem',
                opacity: 0.5,
                '& .MuiChip-icon': { fontSize: 12 },
              }}
            />
          </Box>
        )}

        {/* Autocomplete Dropdown */}
        <Popper
          open={popperOpen && (items.length > 0 || isLoading)}
          anchorEl={anchorEl}
          placement="top-start"
          style={{ zIndex: 1300, width: anchorEl?.offsetWidth || 400 }}
          disablePortal={false}
        >
          <Paper
            elevation={8}
            sx={{
              borderRadius: 3,
              mb: 1,
              border: '1px solid',
              borderColor: alpha(theme.palette.divider, 0.1),
              bgcolor: alpha(theme.palette.background.paper, 0.98),
              backdropFilter: 'blur(20px)',
              maxHeight: 300,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            {/* Header */}
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.1),
                bgcolor: alpha(theme.palette.primary.main, 0.04),
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                }}
              >
                {mentionState?.type === 'contact' ? (
                  <>
                    <AtSign size={12} />
                    {t.ai?.mentions?.selectContact || 'Select Contact'}
                  </>
                ) : (
                  <>
                    <Hash size={12} />
                    {t.ai?.mentions?.selectAccount || 'Select Account'}
                  </>
                )}
              </Typography>
            </Box>

            {/* Loading state */}
            {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            )}

            {/* Items list */}
            {!isLoading && items.length > 0 && (
              <List sx={{ py: 0.5 }}>
                {items.map((item, index) => (
                  <ListItemButton
                    key={item.id}
                    selected={index === clampedSelectedIndex}
                    onClick={() => handleSelectItem(item)}
                    sx={{
                      py: 1,
                      px: 2,
                      '&.Mui-selected': {
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        '&:hover': {
                          bgcolor: alpha(theme.palette.primary.main, 0.12),
                        },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {item.type === 'contact' ? (
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            color: 'primary.main',
                            fontSize: '0.875rem',
                          }}
                        >
                          {item.primary.charAt(0).toUpperCase()}
                        </Avatar>
                      ) : (
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: alpha(theme.palette.secondary.main, 0.1),
                          }}
                        >
                          {item.icon}
                        </Box>
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {item.primary}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {item.secondary}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}

            {/* Empty state */}
            {!isLoading && items.length === 0 && mentionState?.query && (
              <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {mentionState.type === 'contact'
                    ? (t.ai?.mentions?.noContactsFound || 'No contacts found')
                    : (t.ai?.mentions?.noAccountsFound || 'No accounts found')}
                </Typography>
              </Box>
            )}

            {/* Keyboard hints */}
            <Box
              sx={{
                px: 2,
                py: 1,
                borderTop: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.1),
                display: 'flex',
                gap: 2,
                bgcolor: alpha(theme.palette.background.default, 0.5),
                '& kbd': {
                  fontSize: '0.65rem',
                  px: 0.5,
                  py: 0.25,
                  borderRadius: 0.5,
                  bgcolor: alpha(theme.palette.text.primary, 0.08),
                  fontFamily: 'inherit',
                },
              }}
            >
              <Typography variant="caption" color="text.secondary">
                <kbd>↑↓</kbd> {t.ai?.mentions?.navigate || 'navigate'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <kbd>↵</kbd> {t.ai?.mentions?.select || 'select'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <kbd>esc</kbd> {t.ai?.mentions?.close || 'close'}
              </Typography>
            </Box>
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

export default MentionInput;

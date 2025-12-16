import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  TextField,
  InputAdornment,
  IconButton,
  Box,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  Typography,
  CircularProgress,
  Chip,
  Popper,
  ClickAwayListener,
} from '@mui/material';
import { Sparkles, X } from 'lucide-react';
import { aiApi, type MemorySearchItem } from '@/lib/api/ai';
import { useTranslations } from '@/lib/hooks/use-translations';
import { getErrorMessage } from '@/lib/error-utils';

/**
 * Props for AISearchBar
 */
interface AISearchBarProps {
  /**
   * Callback when a search result is clicked
   */
  onResultClick?: (item: MemorySearchItem) => void;

  /**
   * Optional placeholder text
   */
  placeholder?: string;

  /**
   * Optional size variant
   */
  size?: 'small' | 'medium';
}

/**
 * AISearchBar - AI-powered semantic search bar for email
 *
 * Features:
 * - Natural language search queries
 * - Semantic similarity search using knowledge base
 * - Real-time search results dropdown
 * - Click to open email from results
 *
 * @example
 * ```tsx
 * <AISearchBar
 *   onResultClick={(item) => handleOpenEmail(item.emailId)}
 *   placeholder="Ask AI about your emails..."
 * />
 * ```
 */
export const AISearchBar: React.FC<AISearchBarProps> = ({
  onResultClick,
  placeholder,
  size = 'small',
}) => {
  const t = useTranslations();
  const resolvedPlaceholder = placeholder ?? t.email.list.aiSearchPlaceholder;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemorySearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Handle search with debounce
  const handleSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setOpen(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await aiApi.searchMemory({
          query: searchQuery,
          limit: 10,
        });

        setResults(response.data.items);
        setOpen(true);
      } catch (err) {
        setError(getErrorMessage(err, t));
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Debounced search on query change
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearch(query);
      }, 500); // 500ms debounce
    } else {
      setResults([]);
      setOpen(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, handleSearch]);

  // Handle result click
  const handleResultClick = useCallback(
    (item: MemorySearchItem) => {
      if (item.emailId && onResultClick) {
        onResultClick(item);
      }
      setOpen(false);
      setQuery('');
    },
    [onResultClick],
  );

  // Handle clear
  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setOpen(false);
    setError(null);
  }, []);

  // Handle click away
  const handleClickAway = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box ref={anchorRef} sx={{ position: 'relative', width: '100%' }}>
        <TextField
          fullWidth
          size={size}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={resolvedPlaceholder}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Sparkles size={18} style={{ color: '#9c27b0', opacity: 0.7 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading && <CircularProgress size={18} />}
                {query && !loading && (
                  <IconButton size="small" onClick={handleClear}>
                    <X size={16} />
                  </IconButton>
                )}
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: 'background.paper',
            },
          }}
        />

        <Popper
          open={open && (results.length > 0 || error !== null)}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          style={{ width: anchorRef.current?.offsetWidth, zIndex: 1300 }}
        >
          <Paper
            elevation={8}
            sx={{
              mt: 1,
              maxHeight: 400,
              overflow: 'auto',
              borderRadius: 2,
            }}
          >
            {error && (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="error">
                  {error}
                </Typography>
              </Box>
            )}

            {!error && results.length > 0 && (
              <List dense>
                {results.map((item, index) => (
                  <ListItemButton
                    key={item.id || index}
                    onClick={() => handleResultClick(item)}
                    sx={{
                      borderBottom:
                        index < results.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider',
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {item.subject || t.common.noSubject}
                          </Typography>
                          {item.score !== null && (
                            <Chip
                              label={`${Math.round((item.score || 0) * 100)}%`}
                              size="small"
                              color="primary"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              mb: 0.5,
                            }}
                          >
                            {item.from || t.email.view.memoryUnknownSender}
                            {item.receivedAt ? (
                              <>
                                {t.common.separatorDot}
                                {new Date(item.receivedAt).toLocaleDateString(t.locale)}
                              </>
                            ) : null}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {item.snippet}
                          </Typography>
                        </>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
            )}

            {!error && results.length === 0 && query && !loading && (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {t.email.empty.searchTitle}. {t.email.empty.searchSubtitle}
                </Typography>
              </Box>
            )}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
};

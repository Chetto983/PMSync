import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  IconButton,
  Typography,
  Divider,
  Stack,
  Tabs,
  Tab,
  Autocomplete,
  Chip,
} from '@mui/material';
import { X, Search as SearchIcon, Sparkles, Filter } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLabelStore } from '@/stores/label-store';

/**
 * Advanced search filters
 */
export interface AdvancedSearchFilters {
  // Standard filters
  searchQuery?: string;
  from?: string;
  to?: string;
  subject?: string;
  labelIds?: string[];
  startDate?: string;
  endDate?: string;
  hasAttachments?: boolean;
  isRead?: boolean | null; // null = both, true = read only, false = unread only
  isStarred?: boolean;
  isImportant?: boolean;

  // AI/Semantic search
  semanticQuery?: string;
  useAI?: boolean;
}

/**
 * Props for AdvancedSearchDialog
 */
interface AdvancedSearchDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;

  /**
   * Initial filter values
   */
  initialFilters?: AdvancedSearchFilters;

  /**
   * Callback when dialog closes
   */
  onClose: () => void;

  /**
   * Callback when search is applied
   */
  onSearch: (filters: AdvancedSearchFilters) => void;

  /**
   * Callback to reset all filters
   */
  onReset?: () => void;
}

/**
 * AdvancedSearchDialog - Dialog for advanced email search with multiple filters
 *
 * Features:
 * - Text search query
 * - Sender (from) filter
 * - Date range filter
 * - Has attachments filter
 * - Read/Unread filter
 * - Starred filter
 *
 * @example
 * ```tsx
 * <AdvancedSearchDialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onSearch={(filters) => handleSearch(filters)}
 *   onReset={() => handleReset()}
 * />
 * ```
 */
export const AdvancedSearchDialog: React.FC<AdvancedSearchDialogProps> = ({
  open,
  initialFilters = {},
  onClose,
  onSearch,
  onReset,
}) => {
  const t = useTranslations();
  const { labels, fetchLabels } = useLabelStore();
  const [filters, setFilters] = useState<AdvancedSearchFilters>(initialFilters);
  const [currentTab, setCurrentTab] = useState<'standard' | 'ai'>('standard');

  // Load labels on mount
  React.useEffect(() => {
    if (open && labels.length === 0) {
      fetchLabels();
    }
  }, [open, labels.length, fetchLabels]);

  // Update filter value
  const updateFilter = useCallback((key: keyof AdvancedSearchFilters, value: AdvancedSearchFilters[keyof AdvancedSearchFilters]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Handle search
  const handleSearch = useCallback(() => {
    onSearch(filters);
    onClose();
  }, [filters, onSearch, onClose]);

  // Handle reset
  const handleReset = useCallback(() => {
    const emptyFilters: AdvancedSearchFilters = {
      searchQuery: '',
      from: '',
      to: '',
      subject: '',
      labelIds: [],
      startDate: '',
      endDate: '',
      hasAttachments: false,
      isRead: null,
      isStarred: false,
      isImportant: false,
      semanticQuery: '',
      useAI: false,
    };
    setFilters(emptyFilters);
    onReset?.();
  }, [onReset]);

  // Handle close
  const handleClose = useCallback(() => {
    setFilters(initialFilters);
    onClose();
  }, [initialFilters, onClose]);

  // Count active filters
  const activeFiltersCount = Object.values(filters).filter((value) => {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'boolean') return value;
    return true;
  }).length;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchIcon size={20} />
            <Typography variant="h6">{t.email.advancedSearch.title}</Typography>
            {activeFiltersCount > 0 && (
              <Typography variant="caption" color="primary">
                ({activeFiltersCount} {t.email.advancedSearch.active})
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={handleClose}>
            <X size={20} />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {/* Tabs */}
        <Tabs value={currentTab} onChange={(_, v) => setCurrentTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tab icon={<Filter size={18} />} label={t.email.advancedSearch.standardSearch} value="standard" iconPosition="start" />
          <Tab icon={<Sparkles size={18} />} label={t.email.advancedSearch.aiSearch} value="ai" iconPosition="start" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* Standard Search Tab */}
          {currentTab === 'standard' && (
            <Stack spacing={3}>
              {/* Text Search Query */}
              <TextField
                fullWidth
                label={t.email.advancedSearch.searchInSubjectBody}
                placeholder={t.email.advancedSearch.enterKeywords}
                value={filters.searchQuery || ''}
                onChange={(e) => updateFilter('searchQuery', e.target.value)}
                InputProps={{
                  startAdornment: <SearchIcon size={18} style={{ marginRight: 8, opacity: 0.5 }} />,
                }}
              />

              <Divider />

              {/* From & To */}
              <TextField
                fullWidth
                label={t.email.advancedSearch.fromSender}
                placeholder={t.email.advancedSearch.senderPlaceholder}
                value={filters.from || ''}
                onChange={(e) => updateFilter('from', e.target.value)}
                helperText={t.email.advancedSearch.filterBySender}
              />

              <TextField
                fullWidth
                label={t.email.advancedSearch.toRecipient}
                placeholder={t.email.advancedSearch.recipientPlaceholder}
                value={filters.to || ''}
                onChange={(e) => updateFilter('to', e.target.value)}
                helperText={t.email.advancedSearch.filterByRecipient}
              />

              {/* Subject */}
              <TextField
                fullWidth
                label={t.email.advancedSearch.subject}
                placeholder={t.email.advancedSearch.subjectPlaceholder}
                value={filters.subject || ''}
                onChange={(e) => updateFilter('subject', e.target.value)}
                helperText={t.email.advancedSearch.filterBySubject}
              />

              {/* Labels */}
              <Autocomplete
                multiple
                fullWidth
                options={labels}
                value={labels.filter(l => filters.labelIds?.includes(l.id))}
                onChange={(_, newValue) => updateFilter('labelIds', newValue.map(l => l.id))}
                getOptionLabel={(option) => option.name}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t.email.advancedSearch.labelsLabel}
                    placeholder={t.email.advancedSearch.labelsPlaceholder}
                    helperText={t.email.advancedSearch.filterByLabels}
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => {
                    const { key, ...tagProps } = getTagProps({ index });
                    return (
                      <Chip
                        key={key}
                        label={option.name}
                        size="small"
                        {...tagProps}
                        sx={{
                          bgcolor: option.color?.backgroundColor || '#9E9E9E',
                          color: option.color?.textColor || '#fff',
                        }}
                      />
                    );
                  })
                }
              />

          <Divider />

          {/* Date Range */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 2 }}>
              {t.email.advancedSearch.dateRange}
            </FormLabel>
            <Stack spacing={2}>
              <TextField
                fullWidth
                label={t.email.advancedSearch.fromDate}
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => updateFilter('startDate', e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                size="small"
              />
              <TextField
                fullWidth
                label={t.email.advancedSearch.toDate}
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => updateFilter('endDate', e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                size="small"
              />
            </Stack>
          </Box>

          <Divider />

          {/* Status Filters */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>
              {t.email.advancedSearch.statusFilters}
            </FormLabel>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.hasAttachments || false}
                    onChange={(e) => updateFilter('hasAttachments', e.target.checked)}
                  />
                }
                label={t.email.advancedSearch.hasAttachments}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.isStarred || false}
                    onChange={(e) => updateFilter('isStarred', e.target.checked)}
                  />
                }
                label={t.email.advancedSearch.starredOnly}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.isImportant || false}
                    onChange={(e) => updateFilter('isImportant', e.target.checked)}
                  />
                }
                label={t.email.advancedSearch.importantOnly}
              />
            </FormGroup>
          </Box>

          {/* Read Status */}
          <Box>
            <FormLabel component="legend" sx={{ mb: 1 }}>
              {t.email.advancedSearch.readStatus}
            </FormLabel>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.isRead === false}
                    onChange={(e) => updateFilter('isRead', e.target.checked ? false : null)}
                  />
                }
                label={t.email.advancedSearch.unreadOnly}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.isRead === true}
                    onChange={(e) => updateFilter('isRead', e.target.checked ? true : null)}
                  />
                }
                label={t.email.advancedSearch.readOnly}
              />
            </FormGroup>
          </Box>
            </Stack>
          )}

          {/* AI Search Tab */}
          {currentTab === 'ai' && (
            <Stack spacing={3}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t.email.advancedSearch.aiSearchDescription}
              </Typography>

              {/* Semantic Query */}
              <TextField
                fullWidth
                multiline
                rows={4}
                label={t.email.advancedSearch.aiSearchLabel}
                placeholder={t.email.advancedSearch.aiSearchPlaceholder}
                value={filters.semanticQuery || ''}
                onChange={(e) => updateFilter('semanticQuery', e.target.value)}
                InputProps={{
                  startAdornment: <Sparkles size={18} style={{ marginRight: 8, opacity: 0.7, color: '#9c27b0' }} />,
                }}
                helperText={t.email.advancedSearch.aiSearchHelperText}
              />

              <Box
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="caption" fontWeight={600} gutterBottom display="block">
                  {t.email.advancedSearch.aiExamples}
                </Typography>
                <Box component="ul" sx={{ pl: 4, my: 0, color: 'text.secondary' }}>
                  <Typography variant="caption" component="li">
                    {t.email.advancedSearch.aiExampleInvoicePayments}
                  </Typography>
                  <Typography variant="caption" component="li">
                    {t.email.advancedSearch.aiExamplePresentation}
                  </Typography>
                  <Typography variant="caption" component="li">
                    {t.email.advancedSearch.aiExampleDeadlines}
                  </Typography>
                  <Typography variant="caption" component="li">
                    {t.email.advancedSearch.aiExampleContracts}
                  </Typography>
                </Box>
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.useAI || false}
                    onChange={(e) => updateFilter('useAI', e.target.checked)}
                  />
                }
                label={t.email.advancedSearch.enableAiSearch}
              />
            </Stack>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleReset} color="inherit">
          {t.email.advancedSearch.resetAll}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleClose}>{t.email.advancedSearch.cancel}</Button>
        <Button variant="contained" onClick={handleSearch} startIcon={<SearchIcon size={16} />}>
          {t.email.advancedSearch.search}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

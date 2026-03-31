import React, { useState } from 'react';
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  CircularProgress,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import { Plus, RefreshCcw, Users, Building, Mail, Phone, ChevronDown, Filter, FileUp } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Provider filter option
 */
export interface ProviderFilter {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

/**
 * Props for ContactSidebar component
 */
interface ContactSidebarProps {
  /**
   * Available provider filters
   */
  providers?: ProviderFilter[];

  /**
   * Currently selected provider ID (null = all)
   */
  selectedProviderId?: string | null;

  /**
   * Callback when provider filter changes
   */
  onProviderSelect?: (providerId: string | null) => void;

  /**
   * Whether sync is in progress
   */
  isSyncing?: boolean;

  /**
   * Callback to trigger sync
   */
  onSync?: () => void;

  /**
   * Callback to open new contact dialog
   */
  onNewContact?: () => void;

  /**
   * Callback to open vCard import dialog
   */
  onImportVCard?: () => void;

  /**
   * Total contact count
   */
  totalCount?: number;

  /**
   * Count of contacts with emails
   */
  withEmailCount?: number;

  /**
   * Count of contacts with phones
   */
  withPhoneCount?: number;

  /**
   * Count of contacts with company
   */
  withCompanyCount?: number;

  /**
   * Selected quick filter
   */
  selectedFilter?: string;

  /**
   * Callback when quick filter changes
   */
  onFilterSelect?: (filter: string | null) => void;
}

/**
 * ContactSidebar - Sidebar with filters and actions
 *
 * Features:
 * - New Contact button
 * - Sync button
 * - Provider filters (collapsible accordion)
 * - Quick filters (has email, has phone, etc.)
 * - Consistent UI with EmailSidebar
 */
export const ContactSidebar: React.FC<ContactSidebarProps> = ({
  providers = [],
  selectedProviderId = null,
  onProviderSelect,
  isSyncing = false,
  onSync,
  onNewContact,
  onImportVCard,
  totalCount = 0,
  withEmailCount,
  withPhoneCount,
  withCompanyCount,
  selectedFilter,
  onFilterSelect,
}) => {
  const theme = useTheme();
  const t = useTranslations();

  // Track which sections are expanded
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [providersExpanded, setProvidersExpanded] = useState(true);

  return (
    <Paper
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 0,
        p: 0,
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header with buttons */}
      <Box
        sx={{
          p: 2,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {/* New Contact Button */}
        {onNewContact && (
          <Button
            variant="contained"
            size="large"
            startIcon={<Plus size={20} />}
            onClick={onNewContact}
            fullWidth
            sx={{
              minHeight: 48,
              height: 48,
              py: 1.5,
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            {t.contacts?.newContact || 'New Contact'}
          </Button>
        )}

        {/* Sync Button */}
        {onSync && (
          <Button
            variant="outlined"
            startIcon={isSyncing ? <CircularProgress size={18} /> : <RefreshCcw size={18} />}
            onClick={onSync}
            disabled={isSyncing}
            fullWidth
            sx={{ textTransform: 'none', fontWeight: 500 }}
          >
            {isSyncing
              ? (t.contacts?.syncing || 'Syncing...')
              : (t.contacts?.sync || 'Sync Contacts')}
          </Button>
        )}

        {/* Import vCard Button */}
        {onImportVCard && (
          <Button
            variant="outlined"
            startIcon={<FileUp size={18} />}
            onClick={onImportVCard}
            fullWidth
            sx={{ textTransform: 'none', fontWeight: 500 }}
          >
            {t.contacts?.importVCard?.button || 'Import vCard'}
          </Button>
        )}
      </Box>

      {/* Scrollable content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.palette.action.hover} transparent`,
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: theme.palette.action.hover,
            borderRadius: '4px',
            '&:hover': {
              bgcolor: theme.palette.action.selected,
            },
          },
        }}
      >
        {/* Quick Filters Accordion */}
        <Accordion
          expanded={filtersExpanded}
          onChange={() => setFiltersExpanded(!filtersExpanded)}
          disableGutters
          elevation={0}
          sx={{
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
          }}
        >
          <AccordionSummary
            expandIcon={<ChevronDown size={16} />}
            sx={{
              minHeight: 40,
              px: 2,
              '&.Mui-expanded': { minHeight: 40 },
              '& .MuiAccordionSummary-content': { my: 0.5 },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Filter size={14} />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, textTransform: 'uppercase' }}
              >
                {t.contacts?.filters || 'Filters'}
              </Typography>
            </Stack>
          </AccordionSummary>

          <AccordionDetails sx={{ p: 0 }}>
            <List sx={{ px: 1, pb: 1 }}>
              {/* All Contacts */}
              <ListItemButton
                selected={!selectedFilter && !selectedProviderId}
                onClick={() => {
                  onFilterSelect?.(null);
                  onProviderSelect?.(null);
                }}
                sx={{
                  borderRadius: 1.5,
                  mb: 0.25,
                  mx: 0.5,
                  py: 0.75,
                  px: 1.5,
                  minHeight: 36,
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Users size={18} />
                </ListItemIcon>
                <ListItemText
                  primary={t.contacts?.allContacts || 'All Contacts'}
                  primaryTypographyProps={{
                    fontSize: '0.8125rem',
                    fontWeight: (!selectedFilter && !selectedProviderId) ? 600 : 500,
                  }}
                />
                {totalCount > 0 && (
                  <Chip
                    label={totalCount}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                    }}
                  />
                )}
              </ListItemButton>

              {/* With Email */}
              {withEmailCount !== undefined && (
                <ListItemButton
                  selected={selectedFilter === 'hasEmail'}
                  onClick={() => onFilterSelect?.('hasEmail')}
                  sx={{
                    borderRadius: 1.5,
                    mb: 0.25,
                    mx: 0.5,
                    py: 0.75,
                    px: 1.5,
                    minHeight: 36,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Mail size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={t.contacts?.withEmail || 'With Email'}
                    primaryTypographyProps={{
                      fontSize: '0.8125rem',
                      fontWeight: selectedFilter === 'hasEmail' ? 600 : 500,
                    }}
                  />
                  {withEmailCount > 0 && (
                    <Chip
                      label={withEmailCount}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    />
                  )}
                </ListItemButton>
              )}

              {/* With Phone */}
              {withPhoneCount !== undefined && (
                <ListItemButton
                  selected={selectedFilter === 'hasPhone'}
                  onClick={() => onFilterSelect?.('hasPhone')}
                  sx={{
                    borderRadius: 1.5,
                    mb: 0.25,
                    mx: 0.5,
                    py: 0.75,
                    px: 1.5,
                    minHeight: 36,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Phone size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={t.contacts?.withPhone || 'With Phone'}
                    primaryTypographyProps={{
                      fontSize: '0.8125rem',
                      fontWeight: selectedFilter === 'hasPhone' ? 600 : 500,
                    }}
                  />
                  {withPhoneCount > 0 && (
                    <Chip
                      label={withPhoneCount}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    />
                  )}
                </ListItemButton>
              )}

              {/* With Company */}
              {withCompanyCount !== undefined && (
                <ListItemButton
                  selected={selectedFilter === 'hasCompany'}
                  onClick={() => onFilterSelect?.('hasCompany')}
                  sx={{
                    borderRadius: 1.5,
                    mb: 0.25,
                    mx: 0.5,
                    py: 0.75,
                    px: 1.5,
                    minHeight: 36,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Building size={18} />
                  </ListItemIcon>
                  <ListItemText
                    primary={t.contacts?.withCompany || 'With Company'}
                    primaryTypographyProps={{
                      fontSize: '0.8125rem',
                      fontWeight: selectedFilter === 'hasCompany' ? 600 : 500,
                    }}
                  />
                  {withCompanyCount > 0 && (
                    <Chip
                      label={withCompanyCount}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    />
                  )}
                </ListItemButton>
              )}
            </List>
          </AccordionDetails>
        </Accordion>

        <Divider sx={{ mx: 2, mb: 1 }} />

        {/* Provider Filters Accordion */}
        {providers.length > 0 && (
          <Accordion
            expanded={providersExpanded}
            onChange={() => setProvidersExpanded(!providersExpanded)}
            disableGutters
            elevation={0}
            sx={{
              '&:before': { display: 'none' },
              '&.Mui-expanded': { margin: 0 },
            }}
          >
            <AccordionSummary
              expandIcon={<ChevronDown size={16} />}
              sx={{
                minHeight: 40,
                px: 2,
                '&.Mui-expanded': { minHeight: 40 },
                '& .MuiAccordionSummary-content': { my: 0.5 },
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontWeight: 600, textTransform: 'uppercase' }}
              >
                {t.contacts?.providers || 'Providers'}
              </Typography>
            </AccordionSummary>

            <AccordionDetails sx={{ p: 0 }}>
              <List sx={{ px: 1, pb: 1 }}>
                {providers.map((provider) => (
                  <ListItemButton
                    key={provider.id}
                    selected={selectedProviderId === provider.id}
                    onClick={() => onProviderSelect?.(provider.id)}
                    sx={{
                      borderRadius: 1.5,
                      mb: 0.25,
                      mx: 0.5,
                      py: 0.75,
                      px: 1.5,
                      minHeight: 36,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      {provider.icon || <Users size={18} />}
                    </ListItemIcon>
                    <ListItemText
                      primary={provider.label}
                      primaryTypographyProps={{
                        fontSize: '0.8125rem',
                        fontWeight: selectedProviderId === provider.id ? 600 : 500,
                        noWrap: true,
                      }}
                    />
                    {provider.count !== undefined && provider.count > 0 && (
                      <Chip
                        label={provider.count}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                        }}
                      />
                    )}
                  </ListItemButton>
                ))}
              </List>
            </AccordionDetails>
          </Accordion>
        )}
      </Box>
    </Paper>
  );
};

export default ContactSidebar;

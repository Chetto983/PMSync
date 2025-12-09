import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import {
  Inbox,
  Star,
  Mail as MailIcon,
  Paperclip,
  Clock,
  Calendar as CalendarIcon,
  RefreshCcw,
  Filter,
  Menu,
} from 'lucide-react';
import { Snackbar, Alert as MuiAlert, Box, useMediaQuery, useTheme, Chip, Alert, Stack, Typography, Button, CircularProgress, Paper, IconButton } from '@mui/material';
import { debounce } from 'lodash-es';
import {
  DndContext,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { emailApi, type EmailListParams, type Conversation } from '@/lib/api/email';
import type { MemorySearchItem } from '@/lib/api/ai';
import { logger } from '@/lib/logger';
import { providersApi, type ProviderConfig } from '@/lib/api/providers';
import { getFolders, type Folder } from '@/lib/api/folders';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailStore, type Email } from '@/stores/email-store';
import { useFoldersStore } from '@/stores/folders-store';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailActions } from '@/hooks/use-email-actions';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { useWebSocket } from '@/hooks/use-websocket';
import { getFolderIcon as getIconForFolderUtil } from '@/lib/utils/folder-normalization';

// Components
import { ResizableEmailLayout } from '@/components/email/ResizableEmailLayout';
import { EmailSidebar, type FolderGroup, type SmartFilter } from '@/components/email/EmailSidebar/EmailSidebar';
import { ThreadList } from '@/components/email/ThreadList';
import { ThreadDisplay } from '@/components/email/ThreadDisplay';
import { ComposeDialog } from '@/components/email/ComposeDialog/ComposeDialog';
import { AdvancedSearchDialog, type AdvancedSearchFilters } from '@/components/email/AdvancedSearchDialog';
import { AISearchBar } from '@/components/email/AISearchBar';
import { LabelManager } from '@/components/labels';
import { BulkActionBar } from '@/components/email/BulkActionBar';
import { LabelSelectorDialog } from '@/components/email/LabelSelectorDialog';
import { FolderSelectorDialog } from '@/components/email/FolderSelectorDialog';
import { EmailDragOverlay } from '@/components/email/shared';

interface FolderItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;
  providerId?: string;
  providerEmail?: string;
  filterFolder?: string;
  queryOverrides?: Partial<EmailListParams>;
  aggregate?: boolean;
  specialUse?: string;
  /** Folder path for folder operations */
  path?: string;
  /** Full folder data for context menu CRUD operations */
  folderData?: Folder;
}

/**
 * API Email type (matches backend response)
 * Used for mapping from API to store format
 */
interface ApiEmail {
  id: string;
  providerId: string;
  externalId: string;
  threadId?: string;
  from: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body?: string;
  bodyPreview?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  receivedAt: string;
  isRead: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  isDraft?: boolean;
  emailLabels?: { label: { id: string; name: string; color?: { backgroundColor: string; textColor: string } | null } }[];
  folder?: string;
  attachments?: { id: string; filename: string; size: number; mimeType: string; isInline: boolean }[];
  inReplyTo?: string;
  references?: string;
  hasCalendarInvite?: boolean;
  calendarInviteStatus?: 'pending' | 'accepted' | 'declined' | 'tentative';
  calendarInviteData?: {
    summary?: string;
    description?: string;
    location?: string;
    startTime?: string | Date;
    endTime?: string | Date;
    isAllDay?: boolean;
    timezone?: string;
    organizer?: { email: string; name?: string };
    attendees?: Array<{ email: string; name?: string; status?: string }>;
    method?: string;
  } | null;
}

/**
 * Compose prefill data for reply/forward operations
 */
interface ComposePrefillData {
  originalEmailId?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  inReplyTo?: string;
  references?: string;
  draftId?: string;
}

/**
 * Map API email to store email format
 * Handles field name differences between API and store
 */
function mapApiEmailToStore(apiEmail: ApiEmail): Email {
  return {
    ...apiEmail,
    // Map isFlagged (API) to isImportant (store)
    isImportant: apiEmail.isFlagged || false,
    // Calculate hasAttachments from attachments array
    hasAttachments: apiEmail.attachments && apiEmail.attachments.length > 0,
  };
}

/**
 * Props for Mailbox component
 */
interface MailboxProps {
  /**
   * Initial search query from URL or external source
   */
  initialSearchQuery?: string;
}

/**
 * Mailbox - Modern email interface with unified components
 *
 * Uses:
 * - ResizableEmailLayout for container structure with resizable panels
 * - EmailSidebar for folder navigation
 * - ThreadList for unified email/conversation list
 * - ThreadDisplay for email detail view
 * - email-store for global state
 * - Custom hooks for actions and keyboard navigation
 */
export function Mailbox({ initialSearchQuery }: MailboxProps = {}) {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const localText = useMemo(() => {
    const rt = t.email.realtime;
    const empty = t.email.empty;
    return {
      connection: {
        connecting: rt.connecting ?? t.common.loading ?? 'Connecting...',
        live: rt.live ?? 'Live',
        reconnecting: rt.reconnecting ?? 'Reconnecting...',
        warning: rt.disconnectedNotice ?? 'Realtime disconnected. Data may be stale until connection is restored.',
      },
      empty: {
        defaultTitle: empty.defaultTitle ?? 'No emails',
        defaultSubtitle: empty.defaultSubtitle ?? t.common.allCaughtUp ?? 'All caught up',
        trashTitle: empty.trashTitle ?? 'Trash is empty',
        trashSubtitle: empty.trashSubtitle ?? 'No deleted messages here.',
        sentTitle: empty.sentTitle ?? 'No sent emails',
        sentSubtitle: empty.sentSubtitle ?? 'Send your first message to see it here.',
        unreadTitle: empty.unreadTitle ?? 'No unread emails',
        unreadSubtitle: empty.unreadSubtitle ?? 'You are all caught up.',
        labelTitle: empty.labelTitle ?? 'No emails with this label',
        labelSubtitle: empty.labelSubtitle ?? 'Try another label or clear filters.',
      },
    };
  }, [t]);

  // Auth store - for WebSocket token
  const { token } = useAuthStore();

  // Store state
  // Use explicit selectors for better re-render reliability
  const storeEmails = useEmailStore((state) => state.emails);
  const storeSelectedEmail = useEmailStore((state) => state.selectedEmail);
  const storeLoading = useEmailStore((state) => state.isLoading);
  const selectedIds = useEmailStore((state) => state.selectedIds);
  const setEmails = useEmailStore((state) => state.setEmails);
  const appendEmails = useEmailStore((state) => state.appendEmails);
  const setSelectedEmail = useEmailStore((state) => state.setSelectedEmail);
  const setLoading = useEmailStore((state) => state.setLoading);
  const toggleSelection = useEmailStore((state) => state.toggleSelection);
  const selectAll = useEmailStore((state) => state.selectAll);
  const clearSelection = useEmailStore((state) => state.clearSelection);
  const storeMarkAsRead = useEmailStore((state) => state.markAsRead);
  const storeBulkDelete = useEmailStore((state) => state.bulkDelete);
  const storeMarkAsStarred = useEmailStore((state) => state.markAsStarred);
  const storeMarkAsImportant = useEmailStore((state) => state.markAsImportant);

  // WebSocket for real-time updates (email events, folder counts, etc.)
  const { isConnected, connectionStatus } = useWebSocket(token, true);

  // Debug: Track email changes
  useEffect(() => {
    logger.debug('[Mailbox] Store emails changed', { count: storeEmails.length });
  }, [storeEmails]);

  // Debug: Track selected email changes
  useEffect(() => {
    if (storeSelectedEmail) {
      logger.debug('[Mailbox] Selected email changed', { emailId: storeSelectedEmail.id, labelCount: storeSelectedEmail.emailLabels?.length });
    }
  }, [storeSelectedEmail]);

  // Folder state derived from store
  const foldersByProvider = useFoldersStore((state) => state.foldersByProvider);
  const providersById = useFoldersStore((state) => state.providersById);
  const setFoldersData = useFoldersStore((state) => state.setFoldersData);
  const countsByFolderId = useFoldersStore((state) => state.countsByFolderId);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [searchQuery] = useState(initialSearchQuery || '');
  const [, setRefreshing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'compose' | 'reply' | 'forward'>('compose');
  const [composePrefill, setComposePrefill] = useState<ComposePrefillData | null>(null);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedSearchFilters>({});
  const [_pagination, setPagination] = useState({ page: 1, hasMore: true, total: 0 });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const [emailStats, setEmailStats] = useState<{ total: number; unread: number; starred: number } | null>(null);
  const [retentionStats, setRetentionStats] = useState<{ totalEmails: number; archivedEmails: number; estimatedSpaceSavedMB: number } | null>(null);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  // Drag-and-drop state for email-to-folder
  const [draggedEmail, setDraggedEmail] = useState<Email | null>(null);
  const [isDraggingEmail, setIsDraggingEmail] = useState(false);

  // Setup DnD sensors with activation constraint to avoid accidental drags
  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Require 10px movement before drag starts
      },
    })
  );

  // Handle compose query params (for reply/forward/new compose from other pages)
  useEffect(() => {
    const { compose, replyTo, forward, to, subject } = router.query;
    if (compose) {
      if (compose === 'reply' && replyTo) {
        const emailId = String(replyTo);
        // Find the original email to get its body for quoting
        const originalEmail = storeEmails.find(e => e.id === emailId);
        const quotedBody = originalEmail?.bodyHtml || originalEmail?.bodyText || '';
        const formattedQuote = quotedBody
          ? `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 0; color: #666;">
              <p>On ${originalEmail?.receivedAt ? new Date(originalEmail.receivedAt).toLocaleString() : ''}, ${originalEmail?.from || ''} wrote:</p>
              ${quotedBody}
            </blockquote>`
          : '';

        setComposeMode('reply');
        setComposePrefill({
          originalEmailId: emailId,
          to: to ? [String(to)] : undefined,
          subject: subject ? String(subject) : undefined,
          body: formattedQuote,
          inReplyTo: originalEmail?.externalId || undefined,
          references: originalEmail?.references || originalEmail?.externalId || undefined,
        });
      } else if (compose === 'forward' && forward) {
        const emailId = String(forward);
        // Find the original email to get its body for forwarding
        const originalEmail = storeEmails.find(e => e.id === emailId);
        const forwardBody = originalEmail?.bodyHtml || originalEmail?.bodyText || '';
        const formattedForward = forwardBody
          ? `<br/><br/>---------- Forwarded message ----------<br/>
              From: ${originalEmail?.from || ''}<br/>
              Date: ${originalEmail?.receivedAt ? new Date(originalEmail.receivedAt).toLocaleString() : ''}<br/>
              Subject: ${originalEmail?.subject || ''}<br/>
              To: ${originalEmail?.to?.join(', ') || ''}<br/><br/>
              ${forwardBody}`
          : '';

        setComposeMode('forward');
        setComposePrefill({
          originalEmailId: emailId,
          subject: subject ? String(subject) : undefined,
          body: formattedForward,
        });
      } else {
        setComposeMode('compose');
        setComposePrefill(null);
      }
      setComposeOpen(true);
      // Clear the compose query params to avoid reopening on refresh
      router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true });
    }
  }, [router, router.query, storeEmails]);

  const getEmptyState = useCallback(() => {
    if (!selectedFolderId) {
      return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
    }

    // Check smart filters and aggregators first (by ID pattern)
    if (selectedFolderId.startsWith('smart:unread')) {
      return { title: localText.empty.unreadTitle, subtitle: localText.empty.unreadSubtitle };
    }
    if (selectedFolderId.startsWith('label:')) {
      return { title: localText.empty.labelTitle, subtitle: localText.empty.labelSubtitle };
    }
    if (selectedFolderId === 'all:inbox') {
      return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
    }

    // Look up folder in foldersByProvider to get its specialUse
    let specialUse: string | undefined;
    for (const folders of Object.values(foldersByProvider)) {
      const folder = folders.find(f => f.id === selectedFolderId);
      if (folder?.specialUse) {
        specialUse = folder.specialUse.toUpperCase();
        break;
      }
    }

    if (specialUse === 'TRASH') {
      return { title: localText.empty.trashTitle, subtitle: localText.empty.trashSubtitle };
    }
    if (specialUse === 'SENT') {
      return { title: localText.empty.sentTitle, subtitle: localText.empty.sentSubtitle };
    }
    return { title: localText.empty.defaultTitle, subtitle: localText.empty.defaultSubtitle };
  }, [selectedFolderId, localText, foldersByProvider]);

  // Load stats, retention, sync status
  useEffect(() => {
    emailApi.getStats().then((res) => {
      const stats = res.data;
      setEmailStats({
        total: stats.total,
        unread: stats.unread,
        starred: stats.starred,
      });
    }).catch(() => { });

    emailApi.getRetentionStats().then((res) => {
      const stats = res.data;
      setRetentionStats({
        totalEmails: stats.totalEmails,
        archivedEmails: stats.archivedEmails,
        estimatedSpaceSavedMB: stats.estimatedSpaceSavedMB,
      });
    }).catch(() => { });

    emailApi.getSyncStatus().then(() => {
      setSyncStatusMessage(null);
    }).catch(() => setSyncStatusMessage(null));
  }, []);

  const handleSyncProviders = async () => {
    if (!providers || providers.length === 0) return;
    setSyncLoading(true);
    try {
      await Promise.all(providers.map((p) => emailApi.syncProvider(p.id)));
      setSyncStatusMessage(t.email.messages.syncTriggered ?? 'Sync triggered for all providers');
      const res = await emailApi.getStats();
      setEmailStats({ total: res.data.total, unread: res.data.unread, starred: res.data.starred });
    } catch {
      setSyncStatusMessage(t.email.messages.syncFailed ?? 'Sync failed');
    } finally {
      setSyncLoading(false);
    }
  };

  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Refs for logging without causing dependency issues
  const storeEmailsRef = useRef(storeEmails);

  // Update refs on each render
  useEffect(() => {
    storeEmailsRef.current = storeEmails;
  });

  // Label manager state
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [labelSelectorOpen, setLabelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);

  // Custom hooks
  const {
    handleDelete,
    handleToggleRead,
    handleToggleStar,
    handleToggleImportant,
    handleArchive,
    handleReply,
    //handleForward,
    handleEmailClick: handleEmailClickOriginal,
  } = useEmailActions({
    onSuccess: (message) => {
      setSnackbar({
        open: true,
        message,
        severity: 'success',
      });
    },
    onError: (message) => {
      setSnackbar({
        open: true,
        message,
        severity: 'error',
      });
    },
  });

  // Handle email click
  const handleEmailClick = useCallback((thread: Email | Conversation) => {
    if ('providerId' in thread) {
      handleEmailClickOriginal(thread as Email);
    }
  }, [handleEmailClickOriginal]);

  // Handle AI search result click
  const handleAISearchResultClick = useCallback(async (item: MemorySearchItem) => {
    if (!item.emailId) return;

    try {
      // Fetch the email by ID
      const response = await emailApi.getEmail(item.emailId);
      const email = response.data;

      // Set as selected email to open in ThreadDisplay
      setSelectedEmail(email);
    } catch (error) {
      logger.error('Failed to open email from AI search', { error });
      setSnackbar({
        open: true,
        message: t.email.messages.failedToOpenEmail ?? 'Failed to open email',
        severity: 'error',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t.email.messages is stable
  }, [setSelectedEmail]);

  // Smart Filters for quick access
  const smartFilters = useMemo<SmartFilter[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    return [
      {
        id: 'smart:unread',
        label: t.email.quickFilters.unread,
        icon: <MailIcon size={18} />,
        color: '#0B7EFF',
      },
      {
        id: 'smart:today',
        label: t.email.quickFilters.today,
        icon: <Clock size={18} />,
        color: '#00C853',
      },
      {
        id: 'smart:this-week',
        label: t.email.quickFilters.thisWeek,
        icon: <CalendarIcon size={18} />,
        color: '#9C27B0',
      },
      {
        id: 'smart:attachments',
        label: t.email.quickFilters.hasAttachments,
        icon: <Paperclip size={18} />,
        color: '#FF9800',
      },
      {
        id: 'smart:important',
        label: t.email.quickFilters.important,
        icon: <Star size={18} />,
        color: '#FFB300',
      },
    ];
  }, [t]);

  // Aggregator folders (All Inbox, All Starred)
  // RFC 6154: Use specialUse for aggregation across providers with different folder names
  const aggregatorFolders = useMemo<FolderItem[]>(
    () => [
      {
        id: 'all:inbox',
        label: t.folders.inbox,
        icon: <Inbox size={20} />,
        aggregate: true,
        specialUse: 'INBOX',
        queryOverrides: { specialUse: 'INBOX' }, // RFC 6154: aggregate by specialUse
      },
      {
        id: 'all:starred',
        label: t.email.starredFolderLabel || t.folders.starred,
        icon: <Star size={20} />,
        color: '#FFB300',
        aggregate: true,
        queryOverrides: { isStarred: true },
      },
    ],
    [t]
  );

  // Convert smart filters to folder items for unified handling
  const smartFilterFolders = useMemo<FolderItem[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return smartFilters.map((filter) => {
      let queryOverrides: Partial<EmailListParams> = {};

      switch (filter.id) {
        case 'smart:unread':
          queryOverrides = { isRead: false };
          break;
        case 'smart:today':
          queryOverrides = {
            startDate: today.toISOString(),
            endDate: endOfToday.toISOString(),
          };
          break;
        case 'smart:this-week':
          queryOverrides = {
            startDate: startOfWeek.toISOString(),
            endDate: endOfWeek.toISOString(),
          };
          break;
        case 'smart:attachments':
          queryOverrides = { hasAttachments: true };
          break;
        case 'smart:important':
          queryOverrides = { isStarred: true };
          break;
      }

      return {
        id: filter.id,
        label: filter.label,
        icon: filter.icon,
        count: filter.count,
        color: filter.color,
        aggregate: true,
        queryOverrides,
      };
    });
  }, [smartFilters]);

  // Derived remote folders from store
  // Use actual folder.path for API queries - provider is source of truth
  const remoteFolders = useMemo<FolderItem[]>(() => {
    const items: FolderItem[] = [];
    Object.entries(foldersByProvider).forEach(([providerId, folders]) => {
      const providerEmail = providersById[providerId]?.email || '';
      folders.forEach((folder) => {
        const IconComponent = getIconForFolderUtil(folder.specialUse);
        const countOverride = countsByFolderId[`${providerId}:${folder.id}`];
        items.push({
          id: folder.id,
          label: folder.name,
          icon: <IconComponent size={20} />,
          count: countOverride?.unreadCount ?? folder.unreadCount,
          providerId: folder.providerId,
          providerEmail,
          filterFolder: folder.path || folder.name, // Use actual path, not normalized
          specialUse: folder.specialUse,
          path: folder.path,
          folderData: folder as Folder, // Pass full folder data for CRUD operations
          queryOverrides: {
            providerId: folder.providerId,
            folder: folder.path || folder.name, // Use actual path for API query
          },
        });
      });
    });
    return items;
  }, [foldersByProvider, providersById, countsByFolderId]);

  // Combined folders
  const combinedFolders = useMemo(
    () => [...smartFilterFolders, ...aggregatorFolders, ...remoteFolders],
    [smartFilterFolders, aggregatorFolders, remoteFolders]
  );

  // Folders grouped by provider for sidebar
  const folderGroups = useMemo<FolderGroup[]>(() => {
    const groups: FolderGroup[] = [];

    if (aggregatorFolders.length) {
      groups.push({
        providerId: 'all',
        providerEmail: t.email.allAccountsLabel || 'All accounts',
        folders: aggregatorFolders,
      });
    }

    const providerMap = new Map<
      string,
      { providerId: string; providerEmail: string; folders: FolderItem[] }
    >();

    remoteFolders.forEach((folder) => {
      if (!folder.providerId) return;
      if (!providerMap.has(folder.providerId)) {
        providerMap.set(folder.providerId, {
          providerId: folder.providerId,
          providerEmail: folder.providerEmail || t.email.noProviders,
          folders: [],
        });
      }
      providerMap.get(folder.providerId)!.folders.push(folder);
    });

    groups.push(
      ...Array.from(providerMap.values()).sort((a, b) =>
        a.providerEmail.localeCompare(b.providerEmail)
      )
    );

    return groups;
  }, [aggregatorFolders, remoteFolders, t]);

  // Get provider icon
  const getProviderIcon = useCallback((providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return null;

    // Return icon based on provider type
    if (provider.providerType === 'google') {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      );
    }

    if (provider.providerType === 'microsoft') {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="#f25022" d="M1 1h10v10H1z" />
          <path fill="#00a4ef" d="M13 1h10v10H13z" />
          <path fill="#7fba00" d="M1 13h10v10H1z" />
          <path fill="#ffb900" d="M13 13h10v10H13z" />
        </svg>
      );
    }

    return null;
  }, [providers]);

  // Load folder metadata
  const loadFolderMetadata = useCallback(async () => {
    try {
      setFoldersLoading(true);
      const folderResponse = await getFolders();
      setFoldersData(folderResponse.providers, folderResponse.foldersByProvider);
      // Note: Provider from folders API is a subset of ProviderConfig - safe cast for display purposes
      setProviders(folderResponse.providers as unknown as ProviderConfig[]);
      setFoldersLoading(false);
    } catch (error) {
      logger.error('Failed to load folders', { error });
      setFoldersLoading(false);
    }
  }, [setFoldersData]);

  // Refresh folders when realtime folder events fire
  useEffect(() => {
    const handler = () => {
      // Store is updated optimistically via WS; skip full refetch to reduce chatter
      // Fallback refresh can be triggered manually if needed
    };

    window.addEventListener('folders:refresh', handler);
    return () => window.removeEventListener('folders:refresh', handler);
  }, []);

  // Load emails data
  const loadData = useCallback(async () => {
    // Calculate active folder directly from selectedFolderId to avoid stale closure
    const currentActiveFolder = combinedFolders.find((folder) => folder.id === selectedFolderId) ||
      combinedFolders[0] ||
      null;

    if (!currentActiveFolder) {
      return;
    }

    try {
      setLoading(true);

      const providersRes = await providersApi.getProviders();
      setProviders(providersRes || []);

      // Check if filtering by label - use backend labelIds filter
      if (currentActiveFolder.id.startsWith('label:')) {
        const labelId = currentActiveFolder.id.replace('label:', '');
        const queryParams: EmailListParams = {
          limit: 50,
          page: 1,
          search: advancedFilters.searchQuery || searchQuery || undefined,
          from: advancedFilters.from || undefined,
          to: advancedFilters.to || undefined,
          subject: advancedFilters.subject || undefined,
          labelIds: [labelId, ...(advancedFilters.labelIds || [])],
          startDate: advancedFilters.startDate || undefined,
          endDate: advancedFilters.endDate || undefined,
          hasAttachments: advancedFilters.hasAttachments || undefined,
          isRead: advancedFilters.isRead !== null ? advancedFilters.isRead : undefined,
          isStarred: advancedFilters.isStarred || undefined,
        };

        const emailsRes = await emailApi.listEmails(queryParams);
        const filteredEmails = (emailsRes.data.emails || []).map((e) => mapApiEmailToStore(e as unknown as ApiEmail));
        setEmails(filteredEmails);
        setSelectedEmail(null);

        // Update pagination for label-filtered results
        setPagination({
          page: 1,
          hasMore: emailsRes.data.emails?.length === 50,
          total: emailsRes.data.pagination?.total || filteredEmails.length,
        });
      } else {
        // Check if any search/filter is active - if so, use listEmails for full results
        const hasActiveFilters = searchQuery ||
          advancedFilters.searchQuery ||
          advancedFilters.from ||
          advancedFilters.to ||
          advancedFilters.subject ||
          advancedFilters.labelIds?.length ||
          advancedFilters.startDate ||
          advancedFilters.endDate ||
          advancedFilters.hasAttachments !== undefined ||
          advancedFilters.isRead != null ||
          advancedFilters.isStarred !== undefined;

        if (hasActiveFilters) {
          // Use listEmails for search/filtered results (shows all matching emails)
          const queryParams: EmailListParams = {
            limit: 50,
            page: 1,
            ...currentActiveFolder.queryOverrides,
            search: advancedFilters.searchQuery || searchQuery || undefined,
            from: advancedFilters.from || undefined,
            to: advancedFilters.to || undefined,
            subject: advancedFilters.subject || undefined,
            labelIds: advancedFilters.labelIds || undefined,
            ...(advancedFilters.startDate ? { startDate: advancedFilters.startDate } : {}),
            ...(advancedFilters.endDate ? { endDate: advancedFilters.endDate } : {}),
            ...(advancedFilters.hasAttachments !== undefined ? { hasAttachments: advancedFilters.hasAttachments } : {}),
            ...(advancedFilters.isRead != null ? { isRead: advancedFilters.isRead } : {}),
            ...(advancedFilters.isStarred !== undefined ? { isStarred: advancedFilters.isStarred } : {}),
          };

          const emailsRes = await emailApi.listEmails(queryParams);
          logger.debug('[Mailbox] API Response - emails (filtered)', { count: emailsRes.data.emails?.length });

          setEmails((emailsRes.data.emails || []).map((e) => mapApiEmailToStore(e as unknown as ApiEmail)));
          setSelectedEmail(null);

          setPagination({
            page: 1,
            hasMore: emailsRes.data.pagination.page < emailsRes.data.pagination.totalPages,
            total: emailsRes.data.pagination.total,
          });
        } else {
          // Use getConversations for default view (groups emails by thread, shows only latest)
          const convParams = {
            limit: 50,
            page: 1,
            providerId: currentActiveFolder.providerId,
            folder: currentActiveFolder.filterFolder || currentActiveFolder.queryOverrides?.folder,
          };

          const convRes = await emailApi.getConversations(convParams);
          logger.debug('[Mailbox] API Response - conversations', { count: convRes.data.conversations?.length });

          // Map conversations to Email-like format for ThreadList compatibility
          const conversationsAsEmails = (convRes.data.conversations || []).map((conv: Conversation) => ({
            id: conv.latestEmailId,
            threadId: conv.threadId,
            providerId: currentActiveFolder.providerId || '',
            externalId: conv.latestEmailId,
            from: conv.from,
            to: conv.to,
            subject: conv.subject,
            snippet: conv.snippet,
            receivedAt: conv.receivedAt,
            isRead: conv.isRead,
            isStarred: conv.isStarred,
            isImportant: conv.isFlagged,
            folder: conv.folder,
            emailLabels: conv.emailLabels,
            emailCount: conv.emailCount, // Pass email count for thread badge
          })) as Email[];

          setEmails(conversationsAsEmails);
          setSelectedEmail(null);

          setPagination({
            page: 1,
            hasMore: convRes.data.pagination.page < convRes.data.pagination.totalPages,
            total: convRes.data.pagination.total,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to load mailbox data', { error });
      setEmails([]);
      setSelectedEmail(null);
      setPagination({ page: 1, hasMore: false, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [combinedFolders, selectedFolderId, searchQuery, advancedFilters, setEmails, setLoading, setSelectedEmail]);


  // Handle label changes - backend always returns updated email
  const handleLabelsChange = useCallback(async (emailId: string, labelIds: string[], updatedEmail?: Email) => {
    if (!updatedEmail) {
      logger.warn('[Mailbox] No updated email provided - this should not happen');
      return;
    }

    logger.debug('[Mailbox] handleLabelsChange', {
      emailId,
      labelIds,
      updatedEmail,
    });

    // Update/insert email in store with backend data (dedup by id)
    const currentList = storeEmailsRef.current;
    const updatedList = currentList.some((email) => email.id === emailId)
      ? currentList.map((email) => (email.id === emailId ? updatedEmail : email))
      : [updatedEmail, ...currentList];
    setEmails(updatedList.filter((email, idx, arr) => arr.findIndex((e) => e.id === email.id) === idx));

    // Ensure store state syncs immediately (and add if missing)
    const storeApi = useEmailStore.getState();
    if (currentList.some((email) => email.id === emailId)) {
      storeApi.updateEmail(emailId, updatedEmail);
    } else {
      storeApi.addEmail(updatedEmail);
    }

    // Maintain thread mapping without dropping other emails in the thread
    const threadId = updatedEmail.threadId;
    if (threadId) {
      const existingIds = storeApi.getThreadEmails(threadId).map((e) => e.id);
      const mergedIds = Array.from(new Set([...existingIds, updatedEmail.id]));
      storeApi.updateThread(threadId, mergedIds);
    }

    // Also update selected email if it's the one being modified
    if (storeSelectedEmail?.id === emailId) {
      setSelectedEmail(updatedEmail);
    }

    setSnackbar({
      open: true,
      message: t.common.save || 'Labels updated',
      severity: 'success',
    });
  }, [storeSelectedEmail, setEmails, setSelectedEmail, t]);

  // Refresh emails
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Load more emails (infinite scroll)
  const loadMoreEmails = useCallback(async () => {
    if (!_pagination.hasMore || storeLoading) return;

    try {
      setLoading(true);
      const nextPage = _pagination.page + 1;
      const currentActiveFolder = combinedFolders.find((f) => f.id === selectedFolderId);
      if (!currentActiveFolder) return;

      const queryParams: EmailListParams = {
        limit: 50,
        page: nextPage,
        ...currentActiveFolder.queryOverrides,
        search: advancedFilters.searchQuery || searchQuery || undefined,
        from: advancedFilters.from || undefined,
        ...(advancedFilters.startDate ? { startDate: advancedFilters.startDate } : {}),
        ...(advancedFilters.endDate ? { endDate: advancedFilters.endDate } : {}),
        ...(advancedFilters.hasAttachments !== undefined ? { hasAttachments: advancedFilters.hasAttachments } : {}),
        ...(advancedFilters.isRead != null ? { isRead: advancedFilters.isRead } : {}),
        ...(advancedFilters.isStarred !== undefined ? { isStarred: advancedFilters.isStarred } : {}),
      };

      const emailsRes = await emailApi.listEmails(queryParams);
      const newEmails = (emailsRes.data.emails || []).map((e) => mapApiEmailToStore(e as unknown as ApiEmail));

      // Append new emails to existing ones
      appendEmails(newEmails);

      // Update pagination
      setPagination({
        page: nextPage,
        hasMore: emailsRes.data.pagination.page < emailsRes.data.pagination.totalPages,
        total: emailsRes.data.pagination.total,
      });
    } catch (error) {
      logger.error('Failed to load more emails', { error });
    } finally {
      setLoading(false);
    }
  }, [_pagination, storeLoading, combinedFolders, selectedFolderId, searchQuery, advancedFilters, appendEmails, setLoading]);


  // Bulk operations handlers with optimistic updates
  const handleBulkMarkRead = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    // Optimistic update - update store immediately
    storeMarkAsRead(emailIds);

    try {
      await emailApi.bulkMarkRead(emailIds, true);
      setSnackbar({
        open: true,
        message: t.email.messages.markRead.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to mark emails as read', { error });
      // Rollback - mark as unread
      emailIds.forEach(id => useEmailStore.getState().updateEmail(id, { isRead: false }));
      setSnackbar({
        open: true,
        message: t.email.messages.markReadFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, storeMarkAsRead, t.email.messages.markRead, t.email.messages.markReadFailed]);

  const handleBulkMarkUnread = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    // Optimistic update - mark as unread immediately
    emailIds.forEach(id => useEmailStore.getState().updateEmail(id, { isRead: false }));

    try {
      await emailApi.bulkMarkRead(emailIds, false);
      setSnackbar({
        open: true,
        message: t.email.messages.markUnread.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to mark emails as unread', { error });
      // Rollback - mark as read
      emailIds.forEach(id => useEmailStore.getState().updateEmail(id, { isRead: true }));
      setSnackbar({
        open: true,
        message: t.email.messages.markUnreadFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, t.email.messages.markUnread, t.email.messages.markUnreadFailed]);

  const handleBulkDelete = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    if (!window.confirm(t.email.messages.deleteConfirm.replace('{count}', emailIds.length.toString()))) {
      return;
    }

    // Save emails for potential rollback
    const emailsToDelete = storeEmails.filter(e => emailIds.includes(e.id));

    // Optimistic delete - remove from store immediately
    storeBulkDelete(emailIds);
    clearSelection();

    try {
      await emailApi.bulkDelete(emailIds);
      setSnackbar({
        open: true,
        message: t.email.messages.deleted.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to delete emails', { error });
      // Rollback - restore deleted emails
      emailsToDelete.forEach(email => useEmailStore.getState().addEmail(email));
      setSnackbar({
        open: true,
        message: t.email.messages.deleteFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, storeBulkDelete, clearSelection, t.email.messages.deleteConfirm, t.email.messages.deleted, t.email.messages.deleteFailed]);

  const handleBulkStar = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    // Optimistic update - star immediately
    storeMarkAsStarred(emailIds, true);

    try {
      await emailApi.bulkStar(emailIds, true);
      setSnackbar({
        open: true,
        message: t.email.messages.starred.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to star emails', { error });
      // Rollback - unstar
      storeMarkAsStarred(emailIds, false);
      setSnackbar({
        open: true,
        message: t.email.messages.starFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, storeMarkAsStarred, t.email.messages.starred, t.email.messages.starFailed]);

  const handleBulkUnstar = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    // Optimistic update - unstar immediately
    storeMarkAsStarred(emailIds, false);

    try {
      await emailApi.bulkStar(emailIds, false);
      setSnackbar({
        open: true,
        message: t.email.messages.unstarred.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to unstar emails', { error });
      // Rollback - star again
      storeMarkAsStarred(emailIds, true);
      setSnackbar({
        open: true,
        message: t.email.messages.unstarFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, storeMarkAsStarred, t.email.messages.unstarred, t.email.messages.unstarFailed]);

  const handleBulkFlag = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    // Optimistic update - flag immediately
    storeMarkAsImportant(emailIds, true);

    try {
      await emailApi.bulkFlag(emailIds, true);
      setSnackbar({
        open: true,
        message: (t.email.messages.markedImportant ?? 'Marked {count} email(s) as important').replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to flag emails', { error });
      // Rollback - unflag
      storeMarkAsImportant(emailIds, false);
      setSnackbar({
        open: true,
        message: t.email.messages.markedImportantFailed ?? 'Failed to mark as important. Please try again.',
        severity: 'error',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t.email.messages is stable
  }, [selectedIds, storeEmails, storeMarkAsImportant]);

  const handleBulkUnflag = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    // Optimistic update - unflag immediately
    storeMarkAsImportant(emailIds, false);

    try {
      await emailApi.bulkFlag(emailIds, false);
      setSnackbar({
        open: true,
        message: (t.email.messages.unmarkedImportant ?? 'Unmarked {count} email(s) as important').replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to unflag emails', { error });
      // Rollback - flag again
      storeMarkAsImportant(emailIds, true);
      setSnackbar({
        open: true,
        message: t.email.messages.unmarkedImportantFailed ?? 'Failed to unmark as important. Please try again.',
        severity: 'error',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t.email.messages is stable
  }, [selectedIds, storeEmails, storeMarkAsImportant]);

  const handleBulkAddLabels = useCallback(async (labelIds: string[]) => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0 || labelIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    try {
      await emailApi.bulkAddLabels(emailIds, labelIds);
      clearSelection();
      // WebSocket will automatically update the UI with the new labels
      setSnackbar({
        open: true,
        message: t.email.messages.labelsAdded.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to add labels', { error });
      setSnackbar({
        open: true,
        message: t.email.messages.labelsFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, clearSelection, t.email.messages.labelsAdded, t.email.messages.labelsFailed]);

  const handleBulkMoveToFolder = useCallback(async (folder: string) => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return;

    // Map threadIds to email IDs for API call
    const emailIds = storeEmails
      .filter((e) => threadIds.includes(e.threadId || e.id))
      .map((e) => e.id);

    if (emailIds.length === 0) return;

    try {
      await emailApi.bulkMoveToFolder(emailIds, folder);
      // Remove moved emails from current view
      storeBulkDelete(emailIds);
      clearSelection();
      setSnackbar({
        open: true,
        message: t.email.messages.moved.replace('{count}', emailIds.length.toString()).replace('{folder}', folder),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to move emails', { error });
      setSnackbar({
        open: true,
        message: t.email.messages.moveFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, storeBulkDelete, clearSelection, t.email.messages.moved, t.email.messages.moveFailed]);

  // Handle drag start - track which email is being dragged
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const dragData = active.data.current;

    if (dragData?.type === 'email') {
      const email = dragData.email as Email;
      setDraggedEmail(email);
      setIsDraggingEmail(true);
      logger.debug('[Mailbox] Drag started', { emailId: email.id, subject: email.subject?.substring(0, 30) });
    }
  }, []);

  // Handle drag end - move email to folder if dropped on valid target
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    // Reset drag state
    setDraggedEmail(null);
    setIsDraggingEmail(false);

    // Check if dropped on a valid folder
    if (!over || !active.data.current) {
      return;
    }

    const dragData = active.data.current;
    const dropData = over.data.current;

    // Only handle email-to-folder drops
    if (dragData.type !== 'email' || dropData?.type !== 'folder') {
      return;
    }

    const droppedEmail = dragData.email as Email & { emailCount?: number };
    const targetFolder = dropData.folder;

    // Get list of email IDs to move (either single or bulk if selected)
    let emailIdsToMove: string[];
    let movedCount = 0;

    if (dragData.isSelected && selectedIds.size > 0) {
      // Bulk drag - move all selected emails/threads
      // For conversation view, we need to get all emails in selected threads
      const selectedThreadIds = Array.from(selectedIds);
      const threadEmailPromises = selectedThreadIds.map(async (threadId) => {
        // Check if any email in store has this threadId with emailCount > 1 (conversation view)
        const conversationEmail = storeEmails.find(e => (e.threadId === threadId || e.id === threadId) && (e as any).emailCount > 1);
        if (conversationEmail?.threadId) {
          // Fetch all emails in thread
          const threadRes = await emailApi.getThread(conversationEmail.threadId);
          return threadRes.data.map(e => e.id);
        }
        // Single email, just return its ID
        const singleEmail = storeEmails.find(e => e.threadId === threadId || e.id === threadId);
        return singleEmail ? [singleEmail.id] : [];
      });
      const allEmailIds = await Promise.all(threadEmailPromises);
      emailIdsToMove = allEmailIds.flat();
      movedCount = selectedIds.size; // Show thread count, not email count
    } else if (droppedEmail.emailCount && droppedEmail.emailCount > 1 && droppedEmail.threadId) {
      // Single conversation drag - move all emails in thread
      try {
        const threadRes = await emailApi.getThread(droppedEmail.threadId);
        emailIdsToMove = threadRes.data.map(e => e.id);
        movedCount = 1; // 1 conversation
      } catch {
        emailIdsToMove = [droppedEmail.id];
        movedCount = 1;
      }
    } else {
      // Single email drag
      emailIdsToMove = [droppedEmail.id];
      movedCount = 1;
    }

    if (emailIdsToMove.length === 0) return;

    // Use the folder's filterFolder or label for the move operation
    const targetFolderName = targetFolder.filterFolder || targetFolder.label;

    try {
      await emailApi.bulkMoveToFolder(emailIdsToMove, targetFolderName);
      // Remove moved emails from current view
      storeBulkDelete(emailIdsToMove);
      clearSelection();
      setSnackbar({
        open: true,
        message: t.email.messages.moved
          .replace('{count}', movedCount.toString())
          .replace('{folder}', targetFolder.label),
        severity: 'success',
      });
    } catch (error) {
      logger.error('[Mailbox] Failed to move emails', { error });
      setSnackbar({
        open: true,
        message: t.email.messages.moveFailed,
        severity: 'error',
      });
    }
  }, [selectedIds, storeEmails, storeBulkDelete, clearSelection, t.email.messages.moved, t.email.messages.moveFailed]);

  // Get drag count for overlay
  const dragCount = useMemo(() => {
    if (!isDraggingEmail) return 1;
    // If the dragged email is selected and there are multiple selections, show count
    if (draggedEmail && selectedIds.has(draggedEmail.threadId || draggedEmail.id) && selectedIds.size > 1) {
      return selectedIds.size;
    }
    return 1;
  }, [isDraggingEmail, draggedEmail, selectedIds]);

  // Load folders on mount
  useEffect(() => {
    loadFolderMetadata();
  }, [loadFolderMetadata]);

  // Auto-select first folder when folders are loaded
  useEffect(() => {
    if (!selectedFolderId && combinedFolders.length > 0) {
      setSelectedFolderId(combinedFolders[0].id);
    }
  }, [combinedFolders, selectedFolderId]);

  // Ref to always access latest loadData without triggering useMemo dependencies
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  });

  // Create a debounced version of loadData for filter changes (500ms delay)
  const debouncedLoadData = useMemo(
    () =>
      debounce(() => {
        if (loadDataRef.current) {
          loadDataRef.current();
        }
      }, 500),
    []
  );

  // Load emails immediately when folder ID changes
  useEffect(() => {
    if (!selectedFolderId) return;
    // Cancel any pending debounced loads from filter changes
    debouncedLoadData.cancel();
    // Load immediately
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId]);

  // Load emails with debounce when advanced filters change
  useEffect(() => {
    if (selectedFolderId) {
      debouncedLoadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedFilters]);

  // Keyboard navigation
  useKeyboardNavigation({
    emails: storeEmails,
    enabled: true,
    onDelete: handleDelete,
    onReply: handleReply,
    onToggleStar: handleToggleStar,
  });

  // Get default provider for compose
  const defaultProviderId = useMemo(() => {
    return providers.find(p => p.isDefault)?.id || providers[0]?.id;
  }, [providers]);

  // Handle advanced search
  const handleAdvancedSearch = useCallback((filters: AdvancedSearchFilters) => {
    setAdvancedFilters(filters);
    // Reload data with new filters (loadData will be called via useEffect since advancedFilters changes)
  }, []);

  // Reset advanced filters
  const handleResetFilters = useCallback(() => {
    setAdvancedFilters({});
  }, []);

  // Handle Reply - open ComposeDialog instead of redirect
  const handleReplyLocal = useCallback((email: Email) => {
    setComposeMode('reply');
    setComposePrefill({
      to: [email.from],
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `<br/><br/>On ${new Date(email.receivedAt).toLocaleString()}, ${email.from} wrote:<br/><blockquote>${email.bodyHtml || email.bodyText}</blockquote>`,
      inReplyTo: email.externalId,
      references: email.references || email.externalId,
    });
    setComposeOpen(true);
  }, []);

  // Handle Reply All - open ComposeDialog
  const handleReplyAllLocal = useCallback((email: Email) => {
    const allRecipients = [email.from, ...(!email.to ? [] : email.to), ...(!email.cc ? [] : email.cc)];
    const uniqueRecipients = Array.from(new Set(allRecipients));

    setComposeMode('reply');
    setComposePrefill({
      to: uniqueRecipients,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: `<br/><br/>On ${new Date(email.receivedAt).toLocaleString()}, ${email.from} wrote:<br/><blockquote>${email.bodyHtml || email.bodyText}</blockquote>`,
      inReplyTo: email.externalId,
      references: email.references || email.externalId,
    });
    setComposeOpen(true);
  }, []);

  // Handle Forward - open ComposeDialog
  const handleForwardLocal = useCallback((email: Email) => {
    setComposeMode('forward');
    setComposePrefill({
      subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
      body: `<br/><br/>---------- Forwarded message ---------<br/>From: ${email.from}<br/>Date: ${new Date(email.receivedAt).toLocaleString()}<br/>Subject: ${email.subject}<br/>To: ${email.to?.join(', ') || ''}<br/><br/>${email.bodyHtml || email.bodyText}`,
    });
    setComposeOpen(true);
  }, []);

  // Handle Edit Draft - open ComposeDialog with draft content
  const handleEditDraft = useCallback((email: Email) => {
    setComposeMode('compose');
    setComposePrefill({
      to: email.to || [],
      cc: email.cc || [],
      bcc: email.bcc || [],
      subject: email.subject || '',
      body: email.bodyHtml || email.bodyText || '',
      // Keep the draft ID so we can update instead of create new
      draftId: email.id,
    });
    setComposeOpen(true);
    // Close the thread display since we're now editing in compose
    setSelectedEmail(null);
  }, [setSelectedEmail]);

  const threads = storeEmails;
  const selectedListId = storeSelectedEmail?.id;
  const listLoading = storeLoading;
  const hasMoreItems = _pagination.hasMore;
  const onLoadMoreThreads = loadMoreEmails;
  const emptyState = { ...getEmptyState(), subtitle: `${getEmptyState().subtitle} ${t.email.messages.trySyncOrFilter ?? 'Try syncing now or adjust filters.'}`.trim() };





  return (
    <DndContext
      sensors={dndSensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <ResizableEmailLayout
        sidebarOpen={mobileSidebarOpen}
        onSidebarClose={() => setMobileSidebarOpen(false)}
        sidebar={
          <EmailSidebar
            folderGroups={folderGroups}
            selectedFolderId={selectedFolderId}
            onFolderSelect={(folderId) => {
              setSelectedFolderId(folderId);
              if (isMobile) {
                setMobileSidebarOpen(false);
              }
            }}
            loading={foldersLoading}
            smartFilters={smartFilters}
            showSmartFilters={true}
            showLabels={true}
            onManageLabels={() => setLabelManagerOpen(true)}
            onCompose={() => setComposeOpen(true)}
            isEmailDragging={isDraggingEmail}
            onFoldersRefresh={loadFolderMetadata}
          />
        }
        list={
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <Paper
              elevation={0}
              sx={{
                px: { xs: 1, sm: 2 },
                py: 1.5,
                borderBottom: 1,
                borderColor: 'divider',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              <Stack spacing={1.25}>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" rowGap={0.5}>
                  {/* Hamburger Menu - Mobile Only */}
                  {isMobile && (
                    <IconButton
                      size="small"
                      onClick={() => setMobileSidebarOpen(true)}
                      sx={{ mr: 0.5 }}
                      aria-label="Open folders menu"
                    >
                      <Menu size={20} />
                    </IconButton>
                  )}
                  <Box
                    component="span"
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: isConnected ? 'success.main' : 'warning.main',
                      boxShadow: isConnected ? '0 0 0 4px rgba(76,175,80,0.15)' : '0 0 0 4px rgba(255,152,0,0.15)',
                    }}
                    aria-label={isConnected ? localText.connection.live : localText.connection.reconnecting}
                  />
                  <Chip
                    size="small"
                    label={
                      connectionStatus === 'connecting'
                        ? localText.connection.connecting
                        : isConnected
                          ? localText.connection.live
                          : localText.connection.reconnecting
                    }
                    color={isConnected ? 'success' : 'warning'}
                    variant={isConnected ? 'filled' : 'outlined'}
                  />
                  {emailStats && (
                    <Typography variant="caption" color="text.secondary">
                      Total: {emailStats.total} | Unread: {emailStats.unread} | Starred: {emailStats.starred}
                    </Typography>
                  )}
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" rowGap={0.5}>
                  {retentionStats && (
                    <Typography variant="caption" color="text.secondary">
                      Archived: {retentionStats.archivedEmails} | Saved: {Math.round(retentionStats.estimatedSpaceSavedMB)} MB
                    </Typography>
                  )}
                  {syncStatusMessage && (
                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                      {syncStatusMessage}
                    </Typography>
                  )}
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={1} sx={{ minWidth: 0 }}>
                  {/* AI Search Bar */}
                  <Box sx={{ flex: '1 1 200px', minWidth: 150, maxWidth: { xs: '100%', sm: 350 } }}>
                    <AISearchBar
                      onResultClick={handleAISearchResultClick}
                      placeholder={t.email.list.aiSearchPlaceholder}
                      size="small"
                    />
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setAdvancedSearchOpen(true)}
                    startIcon={<Filter size={16} />}
                    sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {t.email.advancedSearch.title}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSyncProviders}
                    disabled={syncLoading}
                    startIcon={!syncLoading ? <RefreshCcw size={16} /> : undefined}
                    sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {syncLoading ? <CircularProgress size={14} /> : (t.email.actions?.syncNow || 'Sync')}
                  </Button>
                </Stack>
                {!isConnected && (
                  <Alert severity="warning" variant="outlined">
                    {localText.connection.warning}
                  </Alert>
                )}
              </Stack>
            </Paper>
            {/* Bulk Action Bar */}
            <BulkActionBar
              selectedCount={selectedIds.size}
              totalCount={storeEmails.length}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
              onMarkRead={handleBulkMarkRead}
              onMarkUnread={handleBulkMarkUnread}
              onDelete={handleBulkDelete}
              onStar={handleBulkStar}
              onUnstar={handleBulkUnstar}
              onFlag={handleBulkFlag}
              onUnflag={handleBulkUnflag}
              onAddLabels={() => setLabelSelectorOpen(true)}
              onMoveToFolder={() => setFolderSelectorOpen(true)}
            />

            {/* Render appropriate view based on mode */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <ThreadList
                threads={threads}
                selectedId={selectedListId}
                selectedIds={selectedIds}
                isLoading={listLoading}
                onThreadClick={handleEmailClick}
                onToggleSelect={toggleSelection}
                onToggleRead={handleToggleRead}
                onToggleStar={handleToggleStar}
                onToggleImportant={handleToggleImportant}
                onArchive={(id) => handleArchive([id])}
                onDelete={handleDelete}
                getProviderIcon={getProviderIcon}
                onLoadMore={onLoadMoreThreads}
                hasMore={hasMoreItems}
                emptyTitle={emptyState.title}
                emptySubtitle={emptyState.subtitle}
              />
            </Box>
          </Box>
        }
        detail={
          storeSelectedEmail ? (
            <ThreadDisplay
              email={storeSelectedEmail}
              onClose={() => setSelectedEmail(null)}
              onToggleStar={handleToggleStar}
              onArchive={(id) => handleArchive([id])}
              onDelete={handleDelete}
              onReply={handleReplyLocal}
              onReplyAll={handleReplyAllLocal}
              onForward={handleForwardLocal}
              onLabelsChange={handleLabelsChange}
              onEditDraft={handleEditDraft}
            />
          ) : undefined
        }
        showDetail={!!storeSelectedEmail}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>

      {/* Compose Dialog */}
      <ComposeDialog
        open={composeOpen}
        mode={composeMode}
        defaultProviderId={defaultProviderId}
        prefillData={composePrefill ?? undefined}
        onClose={() => {
          setComposeOpen(false);
          setComposeMode('compose');
          setComposePrefill(null);
        }}
        onSent={() => {
          setSnackbar({
            open: true,
            message: t.email.messages.emailSent,
            severity: 'success',
          });
          setComposeOpen(false);
          setComposeMode('compose');
          setComposePrefill(null);
          handleRefresh(); // Refresh email list
        }}
        onError={(message) => {
          setSnackbar({
            open: true,
            message,
            severity: 'error',
          });
        }}
      />

      {/* Advanced Search Dialog */}
      <AdvancedSearchDialog
        open={advancedSearchOpen}
        initialFilters={advancedFilters}
        onClose={() => setAdvancedSearchOpen(false)}
        onSearch={handleAdvancedSearch}
        onReset={handleResetFilters}
      />

      {/* Label Manager Dialog */}
      <LabelManager
        open={labelManagerOpen}
        onClose={() => setLabelManagerOpen(false)}
      />

      <LabelSelectorDialog
        open={labelSelectorOpen}
        onClose={() => setLabelSelectorOpen(false)}
        onSelect={handleBulkAddLabels}
        selectedCount={selectedIds.size}
      />

      <FolderSelectorDialog
        open={folderSelectorOpen}
        onClose={() => setFolderSelectorOpen(false)}
        onSelect={handleBulkMoveToFolder}
        selectedCount={selectedIds.size}
      />

      {/* Drag overlay for visual feedback */}
      <EmailDragOverlay
        activeEmail={draggedEmail}
        dragCount={dragCount}
      />
    </DndContext>
  );
}

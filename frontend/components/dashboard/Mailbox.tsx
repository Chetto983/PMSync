import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
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
import type { ProviderConfig } from '@/lib/api/providers';
import { getFolders, type Folder } from '@/lib/api/folders';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useEmailStore, type Email } from '@/stores/email-store';
import { useFoldersStore } from '@/stores/folders-store';
import { useAuthStore } from '@/stores/auth-store';
import { useEmailActions } from '@/hooks/use-email-actions';
import { useKeyboardNavigation } from '@/hooks/use-keyboard-navigation';
import { useWebSocket } from '@/hooks/use-websocket';
import { getFolderIcon as getIconForFolderUtil } from '@/lib/utils/folder-normalization';
import { emailKeys, useEmailStats, useInfiniteConversations, useInfiniteEmails, useRetentionStats } from '@/hooks/queries';

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
  /**
   * Initial email ID to open when component mounts
   */
  initialEmailId?: string;
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
export function Mailbox({ initialSearchQuery, initialEmailId }: MailboxProps = {}) {
  const router = useRouter();
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();
  const localText = useMemo(() => {
    return {
      connection: {
        connecting: t.email.realtime.connecting,
        live: t.email.realtime.live,
        reconnecting: t.email.realtime.reconnecting,
        warning: t.email.realtime.disconnectedNotice,
      },
      empty: {
        defaultTitle: t.email.empty.defaultTitle,
        defaultSubtitle: t.email.empty.defaultSubtitle,
        trashTitle: t.email.empty.trashTitle,
        trashSubtitle: t.email.empty.trashSubtitle,
        sentTitle: t.email.empty.sentTitle,
        sentSubtitle: t.email.empty.sentSubtitle,
        unreadTitle: t.email.empty.unreadTitle,
        unreadSubtitle: t.email.empty.unreadSubtitle,
        labelTitle: t.email.empty.labelTitle,
        labelSubtitle: t.email.empty.labelSubtitle,
      },
    };
  }, [t]);

  // Auth store - for WebSocket token
  const { token } = useAuthStore();

  // Store state
  // Use explicit selectors for better re-render reliability
  const storeSelectedEmail = useEmailStore((state) => state.selectedEmail);
  const selectedIds = useEmailStore((state) => state.selectedIds);
  const setSelectedEmail = useEmailStore((state) => state.setSelectedEmail);
  const toggleSelection = useEmailStore((state) => state.toggleSelection);
  const clearSelection = useEmailStore((state) => state.clearSelection);

  // WebSocket for real-time updates (email events, folder counts, etc.)
  const { isConnected, connectionStatus } = useWebSocket(token, true);

  // Debug: Track selected email changes
  useEffect(() => {
    if (storeSelectedEmail) {
      logger.debug('[Mailbox] Selected email changed', {
        emailId: storeSelectedEmail.id,
        labelCount: storeSelectedEmail.emailLabels?.length,
      });
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
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<'compose' | 'reply' | 'forward'>('compose');
  const [composePrefill, setComposePrefill] = useState<ComposePrefillData | null>(null);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedSearchFilters>({});
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const emailStatsQuery = useEmailStats();
  const retentionStatsQuery = useRetentionStats();
  const emailStats = emailStatsQuery.data ?? null;
  const retentionStats = retentionStatsQuery.data ?? null;

  // Drag-and-drop state for email-to-folder
  const [draggedEmail, setDraggedEmail] = useState<Email | Conversation | null>(null);
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

    if (!compose) return;

    const openFromQuery = async () => {
      const storeApi = useEmailStore.getState();

      if (compose === 'reply' && replyTo) {
        const emailId = String(replyTo);

        let originalEmail = storeApi.emails.find((e) => e.id === emailId);
        if (!originalEmail) {
          try {
            const response = await emailApi.getEmail(emailId);
            originalEmail = mapApiEmailToStore(response.data as unknown as ApiEmail);
            storeApi.updateEmail(emailId, originalEmail);
          } catch (error) {
            logger.error('[Mailbox] Failed to fetch email for reply prefill', { emailId, error });
          }
        }

        const quotedBody = originalEmail?.bodyHtml || originalEmail?.bodyText || '';
        const quotedDate = originalEmail?.receivedAt ? new Date(originalEmail.receivedAt).toLocaleString() : '';
        const quotedFrom = originalEmail?.from || '';
        const quoteHeader = t.email.composer.replyQuotedHeader
          .replace('{date}', quotedDate)
          .replace('{from}', quotedFrom);
        const formattedQuote = quotedBody
          ? `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 0; color: #666;">
              <p>${quoteHeader}</p>
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

        let originalEmail = storeApi.emails.find((e) => e.id === emailId);
        if (!originalEmail) {
          try {
            const response = await emailApi.getEmail(emailId);
            originalEmail = mapApiEmailToStore(response.data as unknown as ApiEmail);
            storeApi.updateEmail(emailId, originalEmail);
          } catch (error) {
            logger.error('[Mailbox] Failed to fetch email for forward prefill', { emailId, error });
          }
        }

        const forwardBody = originalEmail?.bodyHtml || originalEmail?.bodyText || '';
        const forwardedDate = originalEmail?.receivedAt ? new Date(originalEmail.receivedAt).toLocaleString() : '';
        const forwardedHeader = t.email.composer.forwardedMessageHeader;
        const forwardFromLabel = t.email.composer.from;
        const forwardDateLabel = t.email.view.date;
        const forwardSubjectLabel = t.email.composer.subject;
        const forwardToLabel = t.email.view.to;
        const formattedForward = forwardBody
          ? `<br/><br/>${forwardedHeader}<br/>
              ${forwardFromLabel}: ${originalEmail?.from || ''}<br/>
              ${forwardDateLabel}: ${forwardedDate}<br/>
              ${forwardSubjectLabel}: ${originalEmail?.subject || ''}<br/>
              ${forwardToLabel}: ${originalEmail?.to?.join(', ') || ''}<br/><br/>
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
    };

    void openFromQuery();
  }, [router, router.query, t]);

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

  const handleSyncProviders = useCallback(async () => {
    if (!providers || providers.length === 0) return;
    setSyncLoading(true);
    try {
      await Promise.all(providers.map((p) => emailApi.syncProvider(p.id)));
      setSyncStatusMessage(t.email.messages.syncTriggered);
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      queryClient.invalidateQueries({ queryKey: emailKeys.syncStatus() });
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    } catch {
      setSyncStatusMessage(t.email.messages.syncFailed);
    } finally {
      setSyncLoading(false);
    }
  }, [providers, queryClient, t.email.messages.syncFailed, t.email.messages.syncTriggered]);

  // Mobile sidebar state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Label manager state
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [labelSelectorOpen, setLabelSelectorOpen] = useState(false);
  const [folderSelectorOpen, setFolderSelectorOpen] = useState(false);

  // Custom hooks
  const {
    handleDelete,
    handleBulkDelete: handleBulkDeleteEmails,
    handleMarkAsRead,
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

  // Handle email click - supports both Email and Conversation types
  const handleEmailClick = useCallback(async (thread: Email | Conversation) => {
    if ('providerId' in thread) {
      // Direct Email object - use original handler
      useEmailStore.getState().updateEmail(thread.id, thread);
      handleEmailClickOriginal(thread as Email);
    } else if ('latestEmailId' in thread && thread.latestEmailId) {
      // Conversation object - fetch the latest email and display it
      try {
        const response = await emailApi.getEmail(thread.latestEmailId);
        const email = mapApiEmailToStore(response.data as unknown as ApiEmail);
        useEmailStore.getState().updateEmail(email.id, email);
        handleEmailClickOriginal(email);
      } catch (error) {
        logger.error('Failed to open conversation email', { error });
        setSnackbar({
          open: true,
          message: t.email.messages.failedToOpenEmail,
          severity: 'error',
        });
      }
    }
  }, [handleEmailClickOriginal, setSnackbar, t.email.messages.failedToOpenEmail]);

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
        message: t.email.messages.failedToOpenEmail,
        severity: 'error',
      });
    }
  }, [setSelectedEmail, t.email.messages.failedToOpenEmail]);

  // Smart Filters for quick access
  // Note: Counts come from database API (emailStats) - no need to load all emails
  const smartFilters = useMemo<SmartFilter[]>(() => {
    return [
      {
        id: 'smart:unread',
        label: t.email.quickFilters.unread,
        icon: <MailIcon size={18} />,
        color: '#0B7EFF',
        count: emailStats?.unread && emailStats.unread > 0 ? emailStats.unread : undefined,
      },
      {
        id: 'smart:today',
        label: t.email.quickFilters.today,
        icon: <Clock size={18} />,
        color: '#00C853',
        count: emailStats?.today && emailStats.today > 0 ? emailStats.today : undefined,
      },
      {
        id: 'smart:this-week',
        label: t.email.quickFilters.thisWeek,
        icon: <CalendarIcon size={18} />,
        color: '#9C27B0',
        count: emailStats?.thisWeek && emailStats.thisWeek > 0 ? emailStats.thisWeek : undefined,
      },
      {
        id: 'smart:attachments',
        label: t.email.quickFilters.hasAttachments,
        icon: <Paperclip size={18} />,
        color: '#FF9800',
        count: emailStats?.attachments && emailStats.attachments > 0 ? emailStats.attachments : undefined,
      },
      {
        id: 'smart:important',
        label: t.email.quickFilters.important,
        icon: <Star size={18} />,
        color: '#FFB300',
        count: emailStats?.important && emailStats.important > 0 ? emailStats.important : undefined,
      },
    ];
  }, [t, emailStats]);

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
        // CANONICAL FOLDER ARCHITECTURE:
        // Backend expects canonical folder names (INBOX, SENT, TRASH, etc.)
        // Use specialUse (which is canonical) for API queries
        // Fall back to path only for custom folders without specialUse
        const canonicalFolder = folder.specialUse?.toUpperCase() || folder.path || folder.name;
        items.push({
          id: folder.id,
          label: folder.name,
          icon: <IconComponent size={20} />,
          count: countOverride?.unreadCount ?? folder.unreadCount,
          providerId: folder.providerId,
          providerEmail,
          filterFolder: canonicalFolder, // Use canonical name for API queries
          specialUse: folder.specialUse,
          path: folder.path,
          folderData: folder as Folder, // Pass full folder data for CRUD operations
          queryOverrides: {
            providerId: folder.providerId,
            folder: canonicalFolder, // Use canonical name for API query
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
        providerEmail: t.email.allAccountsLabel,
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

  const activeFolder = useMemo<FolderItem | null>(() => {
    if (selectedFolderId) {
      return combinedFolders.find((folder) => folder.id === selectedFolderId) ?? combinedFolders[0] ?? null;
    }
    return combinedFolders[0] ?? null;
  }, [combinedFolders, selectedFolderId]);

  const labelFolderId = useMemo(() => {
    if (!activeFolder) return undefined;
    return activeFolder.id.startsWith('label:') ? activeFolder.id.replace('label:', '') : undefined;
  }, [activeFolder]);

  const useEmailListView = useMemo(() => {
    if (labelFolderId) return true;
    if (!activeFolder) return true;

    const hasActiveFilters = Boolean(
      searchQuery ||
        advancedFilters.searchQuery ||
        advancedFilters.from ||
        advancedFilters.to ||
        advancedFilters.subject ||
        (advancedFilters.labelIds?.length ?? 0) > 0 ||
        advancedFilters.startDate ||
        advancedFilters.endDate ||
        advancedFilters.hasAttachments !== undefined ||
        advancedFilters.isRead != null ||
        advancedFilters.isStarred !== undefined ||
        activeFolder.queryOverrides?.isRead !== undefined ||
        activeFolder.queryOverrides?.isStarred !== undefined ||
        activeFolder.queryOverrides?.hasAttachments !== undefined ||
        activeFolder.queryOverrides?.startDate !== undefined ||
        activeFolder.queryOverrides?.endDate !== undefined,
    );

    return hasActiveFilters;
  }, [activeFolder, advancedFilters, labelFolderId, searchQuery]);

  const emailListParams = useMemo<Omit<EmailListParams, 'page'>>(() => {
    if (!activeFolder) {
      return { limit: 50 };
    }

    if (labelFolderId) {
      return {
        limit: 50,
        search: advancedFilters.searchQuery || searchQuery || undefined,
        from: advancedFilters.from || undefined,
        to: advancedFilters.to || undefined,
        subject: advancedFilters.subject || undefined,
        labelIds: [labelFolderId, ...(advancedFilters.labelIds || [])],
        startDate: advancedFilters.startDate || undefined,
        endDate: advancedFilters.endDate || undefined,
        hasAttachments: advancedFilters.hasAttachments || undefined,
        isRead: advancedFilters.isRead !== null ? advancedFilters.isRead : undefined,
        isStarred: advancedFilters.isStarred || undefined,
      };
    }

    return {
      limit: 50,
      ...activeFolder.queryOverrides,
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
  }, [activeFolder, advancedFilters, labelFolderId, searchQuery]);

  const conversationParams = useMemo(() => {
    return {
      limit: 50,
      providerId: activeFolder?.providerId,
      folder:
        activeFolder?.filterFolder ||
        activeFolder?.queryOverrides?.folder ||
        activeFolder?.specialUse ||
        activeFolder?.queryOverrides?.specialUse,
    };
  }, [activeFolder]);

  const emailsQuery = useInfiniteEmails(emailListParams, {
    enabled: Boolean(activeFolder) && useEmailListView,
  });

  const conversationsQuery = useInfiniteConversations(conversationParams, {
    enabled: Boolean(activeFolder) && !useEmailListView,
  });

  const emailThreads = useMemo(
    () => emailsQuery.data?.pages.flatMap((page) => page.emails) ?? [],
    [emailsQuery.data],
  );

  const conversationThreads = useMemo(
    () => conversationsQuery.data?.pages.flatMap((page) => page.conversations) ?? [],
    [conversationsQuery.data],
  );

  const threads = useMemo<(Email | Conversation)[]>(() => {
    if (useEmailListView) {
      return emailThreads.map((e) => mapApiEmailToStore(e as unknown as ApiEmail));
    }
    return conversationThreads;
  }, [conversationThreads, emailThreads, useEmailListView]);

  const listLoading = useEmailListView
    ? emailsQuery.isPending || emailsQuery.isFetchingNextPage
    : conversationsQuery.isPending || conversationsQuery.isFetchingNextPage;

  const hasMoreItems = useEmailListView ? Boolean(emailsQuery.hasNextPage) : Boolean(conversationsQuery.hasNextPage);

  const onLoadMoreThreads = useCallback(() => {
    if (useEmailListView) {
      if (emailsQuery.hasNextPage && !emailsQuery.isFetchingNextPage) {
        void emailsQuery.fetchNextPage();
      }
      return;
    }

    if (conversationsQuery.hasNextPage && !conversationsQuery.isFetchingNextPage) {
      void conversationsQuery.fetchNextPage();
    }
  }, [conversationsQuery, emailsQuery, useEmailListView]);


  // Handle label changes - backend always returns updated email
  const handleLabelsChange = useCallback(async (emailId: string, labelIds: string[], updatedEmail?: Email) => {
    if (!updatedEmail) {
      logger.warn('[Mailbox] No updated email provided - this should not happen');
      return;
    }

    logger.debug('[Mailbox] handleLabelsChange', { emailId, labelIds });

    // Keep selected email in sync immediately
    if (storeSelectedEmail?.id === emailId) {
      setSelectedEmail(updatedEmail);
    }

    // Store cache for compose/reply prefill and keyboard actions
    useEmailStore.getState().updateEmail(emailId, updatedEmail);

    // Ensure list/detail reflect the new labels
    queryClient.invalidateQueries({ queryKey: emailKeys.detail(emailId) });
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });

    const threadKey = updatedEmail.threadId || emailId;
    queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadKey) });

    setSnackbar({
      open: true,
      message: t.email.messages.labelsUpdated,
      severity: 'success',
    });
  }, [queryClient, setSelectedEmail, storeSelectedEmail, t]);

  // Refresh emails
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
    queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
  }, [queryClient]);

  const getThreadKey = useCallback((thread: Email | Conversation) => {
    return 'providerId' in thread ? thread.threadId || thread.id : thread.threadId;
  }, []);

  const handleSelectAll = useCallback(() => {
    const next = new Set<string>();
    for (const thread of threads) {
      const key = getThreadKey(thread);
      if (key) next.add(key);
    }
    useEmailStore.getState().setSelectedIds(next);
  }, [getThreadKey, threads]);

  const resolveEmailIdsForThread = useCallback(async (thread: Email | Conversation) => {
    if ('providerId' in thread) return [thread.id];

    try {
      const threadRes = await emailApi.getThread(thread.threadId);
      return threadRes.data.map((e) => e.id);
    } catch (error) {
      logger.error('[Mailbox] Failed to expand thread for bulk operation', { threadId: thread.threadId, error });
      return [thread.latestEmailId];
    }
  }, []);

  const resolveSelectedEmailIds = useCallback(async () => {
    const threadIds = Array.from(selectedIds);
    if (threadIds.length === 0) return { emailIds: [], threadCount: 0 };

    const selectedSet = new Set(threadIds);
    const selectedThreads = threads.filter((thread) => selectedSet.has(getThreadKey(thread)));

    const emailIdArrays = await Promise.all(selectedThreads.map(resolveEmailIdsForThread));
    const emailIds = Array.from(new Set(emailIdArrays.flat())).filter(Boolean);

    return { emailIds, threadCount: threadIds.length };
  }, [getThreadKey, resolveEmailIdsForThread, selectedIds, threads]);


  // Bulk operations handlers with optimistic updates
  const handleBulkMarkRead = useCallback(async () => {
    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;
    await handleMarkAsRead(emailIds, true);
  }, [handleMarkAsRead, resolveSelectedEmailIds]);

  const handleBulkMarkUnread = useCallback(async () => {
    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;
    await handleMarkAsRead(emailIds, false);
  }, [handleMarkAsRead, resolveSelectedEmailIds]);

  const handleBulkDelete = useCallback(async () => {
    const { emailIds, threadCount } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;

    const confirmMessage = t.email.messages.deleteConfirm.replace('{count}', threadCount.toString());

    if (!window.confirm(confirmMessage)) return;

    clearSelection();
    await handleBulkDeleteEmails(emailIds);
  }, [clearSelection, handleBulkDeleteEmails, resolveSelectedEmailIds, t.email.messages.deleteConfirm]);

  const handleBulkStar = useCallback(async () => {
    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;

    // Optimistic update
    useEmailStore.getState().markAsStarred(emailIds, true);

    try {
      await emailApi.bulkStar(emailIds, true);
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      setSnackbar({
        open: true,
        message: t.email.messages.starred.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to star emails', { error });
      // Rollback - unstar
      useEmailStore.getState().markAsStarred(emailIds, false);
      setSnackbar({
        open: true,
        message: t.email.messages.starFailed,
        severity: 'error',
      });
    }
  }, [queryClient, resolveSelectedEmailIds, t.email.messages.starFailed, t.email.messages.starred]);

  const handleBulkUnstar = useCallback(async () => {
    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;

    // Optimistic update
    useEmailStore.getState().markAsStarred(emailIds, false);

    try {
      await emailApi.bulkStar(emailIds, false);
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      setSnackbar({
        open: true,
        message: t.email.messages.unstarred.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to unstar emails', { error });
      // Rollback - star again
      useEmailStore.getState().markAsStarred(emailIds, true);
      setSnackbar({
        open: true,
        message: t.email.messages.unstarFailed,
        severity: 'error',
      });
    }
  }, [queryClient, resolveSelectedEmailIds, t.email.messages.unstarFailed, t.email.messages.unstarred]);

  const handleBulkFlag = useCallback(async () => {
    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;

    // Optimistic update
    useEmailStore.getState().markAsImportant(emailIds, true);

    try {
      await emailApi.bulkFlag(emailIds, true);
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      setSnackbar({
        open: true,
        message: t.email.messages.markedImportant.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to flag emails', { error });
      // Rollback - unflag
      useEmailStore.getState().markAsImportant(emailIds, false);
      setSnackbar({
        open: true,
        message: t.email.messages.markedImportantFailed,
        severity: 'error',
      });
    }
  }, [queryClient, resolveSelectedEmailIds, t.email.messages.markedImportant, t.email.messages.markedImportantFailed]);

  const handleBulkUnflag = useCallback(async () => {
    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;

    // Optimistic update
    useEmailStore.getState().markAsImportant(emailIds, false);

    try {
      await emailApi.bulkFlag(emailIds, false);
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
      setSnackbar({
        open: true,
        message: t.email.messages.unmarkedImportant.replace('{count}', emailIds.length.toString()),
        severity: 'success',
      });
    } catch (error) {
      logger.error('Failed to unflag emails', { error });
      // Rollback - flag again
      useEmailStore.getState().markAsImportant(emailIds, true);
      setSnackbar({
        open: true,
        message: t.email.messages.unmarkedImportantFailed,
        severity: 'error',
      });
    }
  }, [queryClient, resolveSelectedEmailIds, t.email.messages.unmarkedImportant, t.email.messages.unmarkedImportantFailed]);

  const handleBulkAddLabels = useCallback(async (labelIds: string[]) => {
    if (labelIds.length === 0) return;

    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;

    try {
      await emailApi.bulkAddLabels(emailIds, labelIds);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
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
  }, [clearSelection, queryClient, resolveSelectedEmailIds, t.email.messages.labelsAdded, t.email.messages.labelsFailed]);

  const handleBulkMoveToFolder = useCallback(async (folder: string) => {
    const { emailIds } = await resolveSelectedEmailIds();
    if (emailIds.length === 0) return;

    try {
      await emailApi.bulkMoveToFolder(emailIds, folder);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
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
  }, [clearSelection, queryClient, resolveSelectedEmailIds, t.email.messages.moved, t.email.messages.moveFailed]);

  // Handle drag start - track which email is being dragged
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const dragData = active.data.current;

    if (dragData?.type === 'email') {
      const thread = dragData.email as Email | Conversation;
      setDraggedEmail(thread);
      setIsDraggingEmail(true);
      logger.debug('[Mailbox] Drag started', { emailId: dragData.emailId, threadId: dragData.threadId });
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

    const droppedThread = dragData.email as Email | Conversation;
    const targetFolder = dropData.folder as FolderItem;
    const targetFolderName = targetFolder.filterFolder || targetFolder.label;

    let emailIdsToMove: string[] = [];
    let movedCount = 0;

    if (dragData.isSelected && selectedIds.size > 0) {
      const resolved = await resolveSelectedEmailIds();
      emailIdsToMove = resolved.emailIds;
      movedCount = resolved.threadCount;
    } else {
      emailIdsToMove = await resolveEmailIdsForThread(droppedThread);
      movedCount = 1;
    }

    if (emailIdsToMove.length === 0) return;

    try {
      await emailApi.bulkMoveToFolder(emailIdsToMove, targetFolderName);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: emailKeys.lists() });
      queryClient.invalidateQueries({ queryKey: emailKeys.conversations() });
      queryClient.invalidateQueries({ queryKey: emailKeys.stats() });
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
  }, [clearSelection, queryClient, resolveEmailIdsForThread, resolveSelectedEmailIds, selectedIds, t.email.messages.moved, t.email.messages.moveFailed]);

  // Get drag count for overlay
  const dragCount = useMemo(() => {
    if (!isDraggingEmail) return 1;
    // If the dragged email is selected and there are multiple selections, show count
    const draggedKey = draggedEmail ? getThreadKey(draggedEmail) : '';
    if (draggedKey && selectedIds.has(draggedKey) && selectedIds.size > 1) {
      return selectedIds.size;
    }
    return 1;
  }, [getThreadKey, isDraggingEmail, draggedEmail, selectedIds]);

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

  // Load initial email from URL parameter (e.g., ?id=xxx from dashboard widgets)
  useEffect(() => {
    if (initialEmailId && !storeSelectedEmail) {
      emailApi.getEmail(initialEmailId)
        .then((response) => {
          if (response.data) {
            setSelectedEmail(response.data);
          }
        })
        .catch((error) => {
          logger.error('Failed to load initial email', { error, emailId: initialEmailId });
        });
    }
  }, [initialEmailId, setSelectedEmail, storeSelectedEmail]);

  // Close detail + selection on context changes (folder/filter/search)
  useEffect(() => {
    clearSelection();
    setSelectedEmail(null);
  }, [advancedFilters, clearSelection, selectedFolderId, setSelectedEmail]);

  // Keyboard navigation
  useKeyboardNavigation({
    threads,
    enabled: true,
    onDelete: handleDelete,
    onReply: handleReply,
    onToggleStar: handleToggleStar,
    onThreadClick: handleEmailClick,
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
    const replyPrefix = t.email.composer.replyPrefix;
    const subject = email.subject?.trim() || '';
    const replySubject = subject.toLowerCase().startsWith(replyPrefix.toLowerCase())
      ? subject
      : `${replyPrefix} ${subject}`.trim();

    const quotedBody = email.bodyHtml || email.bodyText || '';
    const quotedDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '';
    const quotedFrom = email.from || '';
    const quoteHeader = t.email.composer.replyQuotedHeader
      .replace('{date}', quotedDate)
      .replace('{from}', quotedFrom);
    const formattedQuote = quotedBody
      ? `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 0; color: #666;">
          <p>${quoteHeader}</p>
          ${quotedBody}
        </blockquote>`
      : '';

    setComposeMode('reply');
    setComposePrefill({
      originalEmailId: email.id,
      to: [email.from],
      subject: replySubject,
      body: formattedQuote,
      inReplyTo: email.externalId,
      references: email.references || email.externalId,
    });
    setComposeOpen(true);
  }, [t.email.composer.replyPrefix, t.email.composer.replyQuotedHeader]);

  // Handle Reply All - open ComposeDialog
  const handleReplyAllLocal = useCallback((email: Email) => {
    const allRecipients = [email.from, ...(!email.to ? [] : email.to), ...(!email.cc ? [] : email.cc)];
    const uniqueRecipients = Array.from(new Set(allRecipients));

    const replyPrefix = t.email.composer.replyPrefix;
    const subject = email.subject?.trim() || '';
    const replySubject = subject.toLowerCase().startsWith(replyPrefix.toLowerCase())
      ? subject
      : `${replyPrefix} ${subject}`.trim();

    const quotedBody = email.bodyHtml || email.bodyText || '';
    const quotedDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '';
    const quotedFrom = email.from || '';
    const quoteHeader = t.email.composer.replyQuotedHeader
      .replace('{date}', quotedDate)
      .replace('{from}', quotedFrom);
    const formattedQuote = quotedBody
      ? `<br/><br/><blockquote style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 0; color: #666;">
          <p>${quoteHeader}</p>
          ${quotedBody}
        </blockquote>`
      : '';

    setComposeMode('reply');
    setComposePrefill({
      originalEmailId: email.id,
      to: uniqueRecipients,
      subject: replySubject,
      body: formattedQuote,
      inReplyTo: email.externalId,
      references: email.references || email.externalId,
    });
    setComposeOpen(true);
  }, [t.email.composer.replyPrefix, t.email.composer.replyQuotedHeader]);

  // Handle Forward - open ComposeDialog
  const handleForwardLocal = useCallback((email: Email) => {
    const forwardPrefix = t.email.composer.forwardPrefix;
    const subject = email.subject?.trim() || '';
    const forwardSubject = subject.toLowerCase().startsWith(forwardPrefix.toLowerCase())
      ? subject
      : `${forwardPrefix} ${subject}`.trim();

    const forwardBody = email.bodyHtml || email.bodyText || '';
    const forwardedDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : '';
    const forwardedHeader = t.email.composer.forwardedMessageHeader;
    const forwardFromLabel = t.email.composer.from;
    const forwardDateLabel = t.email.view.date;
    const forwardSubjectLabel = t.email.composer.subject;
    const forwardToLabel = t.email.view.to;
    const formattedForward = forwardBody
      ? `<br/><br/>${forwardedHeader}<br/>
          ${forwardFromLabel}: ${email.from || ''}<br/>
          ${forwardDateLabel}: ${forwardedDate}<br/>
          ${forwardSubjectLabel}: ${email.subject || ''}<br/>
          ${forwardToLabel}: ${email.to?.join(', ') || ''}<br/><br/>
          ${forwardBody}`
      : '';

    setComposeMode('forward');
    setComposePrefill({
      originalEmailId: email.id,
      subject: forwardSubject,
      body: formattedForward,
    });
    setComposeOpen(true);
  }, [t.email.composer.forwardPrefix, t.email.composer.forwardedMessageHeader, t.email.composer.from, t.email.composer.subject, t.email.view.date, t.email.view.to]);

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

  const selectedListId = storeSelectedEmail?.threadId || storeSelectedEmail?.id;
  const emptyBase = getEmptyState();
  const emptyState = {
    ...emptyBase,
    subtitle: `${emptyBase.subtitle} ${t.email.messages.trySyncOrFilter}`.trim(),
  };





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
                    {syncLoading ? <CircularProgress size={14} /> : t.email.actions.syncNow}
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
              totalCount={threads.length}
              onSelectAll={handleSelectAll}
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

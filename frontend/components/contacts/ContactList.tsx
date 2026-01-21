import React, { useEffect, useRef, useCallback } from 'react';
import { List, Box, Typography, CircularProgress } from '@mui/material';
import { Users } from 'lucide-react';
import { ContactListItem } from './ContactListItem';
import type { Contact } from '@/lib/api/contacts';

/**
 * Props for ContactList component
 */
interface ContactListProps {
  /**
   * List of contacts to display
   */
  contacts: Contact[];

  /**
   * Currently selected contact ID (for viewing details)
   */
  selectedId?: string;

  /**
   * Set of multi-selected contact IDs
   */
  selectedIds?: Set<string>;

  /**
   * Whether data is loading
   */
  isLoading?: boolean;

  /**
   * Callback when contact is clicked
   */
  onContactClick?: (contact: Contact) => void;

  /**
   * Callback to toggle selection
   */
  onToggleSelect?: (id: string) => void;

  /**
   * Callback to edit contact
   */
  onEdit?: (id: string) => void;

  /**
   * Callback to delete contact
   */
  onDelete?: (id: string) => void;

  /**
   * Callback to email contact
   */
  onEmail?: (email: string) => void;

  /**
   * Callback to call contact
   */
  onCall?: (phone: string) => void;

  /**
   * Callback to toggle VIP status
   */
  onToggleVip?: (id: string, isVip: boolean) => void;

  /**
   * Callback to load more contacts (infinite scroll)
   */
  onLoadMore?: () => void;

  /**
   * Whether there are more contacts to load
   */
  hasMore?: boolean;

  /**
   * Custom empty state title
   */
  emptyTitle?: string;

  /**
   * Custom empty state subtitle
   */
  emptySubtitle?: string;
}

/**
 * ContactList - Contact list with infinite scroll and multi-selection
 *
 * Features:
 * - IntersectionObserver for infinite scroll
 * - Multi-selection support with checkboxes
 * - Loading states
 * - Empty states
 * - Optimized performance with React.memo
 */
export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  selectedId,
  selectedIds = new Set(),
  isLoading = false,
  onContactClick,
  onToggleSelect,
  onEdit,
  onDelete,
  onEmail,
  onCall,
  onToggleVip,
  onLoadMore,
  hasMore = false,
  emptyTitle = 'No contacts',
  emptySubtitle = 'Add contacts or sync from providers',
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Handle contact click
  const handleContactClick = useCallback(
    (contact: Contact) => {
      onContactClick?.(contact);
    },
    [onContactClick]
  );

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Prevent multiple simultaneous loads
        if (entry.isIntersecting && hasMore && !isLoading && !loadingRef.current) {
          loadingRef.current = true;
          onLoadMore();
          // Reset loading ref after a short delay
          setTimeout(() => {
            loadingRef.current = false;
          }, 500);
        }
      },
      {
        root: null,
        rootMargin: '100px', // Start loading 100px before reaching the end
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [onLoadMore, hasMore, isLoading]);

  const isEmpty = contacts.length === 0;

  // Loading state - only show full spinner if loading AND no contacts
  if (isLoading && isEmpty) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: 200,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Empty state
  if (isEmpty) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          minHeight: 200,
          px: 3,
          textAlign: 'center',
        }}
      >
        <Users size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {emptyTitle}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {emptySubtitle}
        </Typography>
      </Box>
    );
  }

  return (
    <List
      sx={{
        width: '100%',
        height: '100%',
        p: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        '&::-webkit-scrollbar': {
          width: 8,
        },
        '&::-webkit-scrollbar-track': {
          bgcolor: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: 'action.hover',
          borderRadius: 4,
        },
        '&::-webkit-scrollbar-thumb:hover': {
          bgcolor: 'action.selected',
        },
      }}
    >
      {contacts.map((contact) => {
        const isMultiSelected = selectedIds.has(contact.id);

        return (
          <ContactListItem
            key={contact.id}
            contact={contact}
            selected={selectedId === contact.id}
            multiSelected={isMultiSelected}
            onToggleSelect={onToggleSelect}
            onEdit={onEdit}
            onDelete={onDelete}
            onEmail={onEmail}
            onCall={onCall}
            onToggleVip={onToggleVip}
            onClick={() => handleContactClick(contact)}
          />
        );
      })}

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <Box
          ref={sentinelRef}
          sx={{
            height: 1,
            width: '100%',
          }}
        />
      )}

      {/* Loading indicator for infinite scroll */}
      {hasMore && isLoading && contacts.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            py: 2,
          }}
        >
          <CircularProgress size={24} />
        </Box>
      )}
    </List>
  );
};

// Export memoized version for performance
export default React.memo(ContactList);

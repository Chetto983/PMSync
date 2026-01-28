/**
 * Contact List Component
 *
 * Virtual scrolling contact list with @tanstack/react-virtual
 * Handles 10,000+ contacts with 60 FPS performance
 *
 * Features:
 * - Virtual scrolling (render only visible items)
 * - Infinite scroll (automatic pagination)
 * - Multi-selection support
 * - Optimized with React.memo
 *
 * Performance targets:
 * - 60 FPS scrolling
 * - <500ms initial render
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { People as UsersIcon } from '@mui/icons-material';
import { useVirtualizer } from '@tanstack/react-virtual';
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
   * Whether loading more (pagination)
   */
  isLoadingMore?: boolean;

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

// Estimated height of each contact item (for virtual scrolling)
const ITEM_HEIGHT = 72;

/**
 * ContactList - Virtualized contact list with infinite scroll
 *
 * Uses @tanstack/react-virtual for optimal performance
 * with large contact lists (10,000+ items)
 */
export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  selectedId,
  selectedIds = new Set(),
  isLoading = false,
  isLoadingMore = false,
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
  // Hover state for action bar visibility (like email list)
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Virtual scrolling setup
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5, // Render 5 extra items above/below viewport for smooth scrolling
  });

  // Handle contact click - memoized
  const handleContactClick = useCallback(
    (contact: Contact) => {
      onContactClick?.(contact);
    },
    [onContactClick]
  );

  // CRITICAL: Memoized mouse event handlers to prevent re-renders (matches email pattern)
  const handleMouseEnter = useCallback((id: string) => {
    setHoveredId(id);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  // Infinite scroll using virtualizer
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];

    // Trigger load more when scrolled near bottom
    if (
      lastItem &&
      lastItem.index >= contacts.length - 5 &&
      hasMore &&
      !isLoadingMore &&
      !isLoading &&
      onLoadMore
    ) {
      onLoadMore();
    }
  }, [virtualItems, contacts.length, hasMore, isLoadingMore, isLoading, onLoadMore]);

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
        <UsersIcon sx={{ fontSize: 48, opacity: 0.3, mb: 2 }} />
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
    <Box
      ref={parentRef}
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
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
      {/* Virtual list container with total height */}
      <Box
        sx={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Render only visible items */}
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const contact = contacts[virtualRow.index];
          if (!contact) return null;

          const isMultiSelected = selectedIds.has(contact.id);

          return (
            <Box
              key={contact.id}
              data-index={virtualRow.index}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ContactListItem
                contact={contact}
                selected={selectedId === contact.id}
                multiSelected={isMultiSelected}
                isHovered={hoveredId === contact.id}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onEmail={onEmail}
                onCall={onCall}
                onToggleVip={onToggleVip}
                onClick={() => handleContactClick(contact)}
                onMouseEnter={() => handleMouseEnter(contact.id)}
                onMouseLeave={handleMouseLeave}
              />
            </Box>
          );
        })}
      </Box>

      {/* Loading indicator for infinite scroll */}
      {(isLoadingMore || (hasMore && isLoading && contacts.length > 0)) && (
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
    </Box>
  );
};

// Export memoized version for performance
export default React.memo(ContactList);

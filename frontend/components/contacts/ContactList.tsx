/**
 * Contact List — Virtual scrolling with @tanstack/react-virtual
 *
 * Performance fixes:
 * - measureElement for accurate dynamic row heights
 * - Stable callback refs (no closures in render loop)
 * - estimateSize matched to compact 52px layout
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { Users as UsersIcon } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ContactListItem } from './ContactListItem';
import type { Contact } from '@/lib/api/contacts';

interface ContactListProps {
  contacts: Contact[];
  selectedId?: string;
  selectedIds?: Set<string>;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onContactClick?: (contact: Contact) => void;
  onToggleSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEmail?: (email: string) => void;
  onCall?: (phone: string) => void;
  onToggleVip?: (id: string, isVip: boolean) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
}

const EMPTY_SET = new Set<string>();

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  selectedId,
  selectedIds = EMPTY_SET,
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  // Stable callbacks — NO closures per row (takes id as param)
  const handleMouseEnter = useCallback((id: string) => {
    setHoveredId(id);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredId(null);
  }, []);

  // onClick passes id, parent resolves contact from the contacts array
  const handleContactClick = useCallback(
    (id: string) => {
      const contact = contacts.find((c) => c.id === id);
      if (contact) onContactClick?.(contact);
    },
    [contacts, onContactClick]
  );

  // Infinite scroll
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
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

  if (isLoading && isEmpty) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isEmpty) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 200, px: 3, textAlign: 'center' }}>
        <UsersIcon size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
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
      }}
    >
      <Box
        sx={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const contact = contacts[virtualRow.index];
          if (!contact) return null;

          return (
            <Box
              key={contact.id}
              ref={virtualizer.measureElement}
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
                multiSelected={selectedIds.has(contact.id)}
                isHovered={hoveredId === contact.id}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onEmail={onEmail}
                onCall={onCall}
                onToggleVip={onToggleVip}
                onClick={handleContactClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              />
            </Box>
          );
        })}
      </Box>

      {(isLoadingMore || (hasMore && isLoading && contacts.length > 0)) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(ContactList);

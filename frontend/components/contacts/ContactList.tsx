/**
 * Contact List — Virtual scrolling with @tanstack/react-virtual
 *
 * Performance fixes:
 * - measureElement for accurate dynamic row heights
 * - Stable callback refs (no closures in render loop)
 * - estimateSize matched to compact 52px layout
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Box, Skeleton } from '@mui/material';
import { Users as UsersIcon } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '@/components/common/EmptyState';
import { useTranslations } from '@/lib/hooks/use-translations';
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
  // TanStack Virtual is intentionally used here for large contact lists.
  // eslint-disable-next-line react-hooks/incompatible-library
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const t = useTranslations();

  if (isLoading && isEmpty) {
    return (
      <Box sx={{ p: 2 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
            <Skeleton variant="circular" width={40} height={40} animation="wave" />
            <Box sx={{ flex: 1 }}>
              <Skeleton width="40%" height={20} animation="wave" />
              <Skeleton width="60%" height={16} animation="wave" sx={{ mt: 0.5 }} />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={UsersIcon}
        color="#7650ce"
        title={emptyTitle}
        description={emptySubtitle}
        actionLabel={t.contacts?.emptyCta}
      />
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
          <Skeleton variant="circular" width={24} height={24} animation="wave" />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(ContactList);

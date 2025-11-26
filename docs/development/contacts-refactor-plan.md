# Contacts Component Refactoring Plan

## Current Issues
1. **Infinite scroll not working** - IntersectionObserver issues
2. **No multi-selection** - Cannot select multiple contacts
3. **No bulk actions** - Cannot bulk delete/edit contacts
4. **UI inconsistent with Email** - Different layout patterns
5. **All code in single file** - 1400+ lines, hard to maintain
6. **Store is basic** - Missing pagination, selection, filters

## Goal
Refactor Contacts to match Email component architecture:
- Modular component structure
- Full multi-selection support
- Bulk operations
- Consistent UI/UX with Email
- Working infinite scroll

---

## Phase 1: Enhance Contact Store

### File: `frontend/stores/contact-store.ts`

Add missing functionality to match `email-store.ts`:

```typescript
interface ContactState {
  // Existing
  contacts: Contact[];
  selectedContact: Contact | null;
  isLoading: boolean;
  searchQuery: string;

  // NEW: Pagination
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };

  // NEW: Multi-selection
  selectedIds: Set<string>;

  // NEW: Filters
  filters: {
    providerId?: string;
    hasEmail?: boolean;
    hasPhone?: boolean;
    company?: string;
  };

  // Existing actions...

  // NEW: Pagination actions
  setPagination: (pagination: Partial<PaginationState>) => void;

  // NEW: Multi-selection actions
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelectedIds: (ids: Set<string>) => void;

  // NEW: Bulk actions
  bulkDelete: (ids: string[]) => void;

  // NEW: Filter actions
  setFilters: (filters: ContactFilters) => void;
  clearFilters: () => void;
}
```

---

## Phase 2: Create Modular Components

### 2.1 ContactLayout
**File:** `frontend/components/contacts/ContactLayout.tsx`

Same pattern as `EmailLayout.tsx`:
- 3-panel layout (sidebar/list/detail)
- Mobile drawer for sidebar
- Responsive design

```
┌────────────┬─────────────────┬────────────────────┐
│  Sidebar   │  Contact List   │  Contact Detail    │
│  (280px)   │   (400px)       │     (flex)         │
│            │                 │                    │
│ - Filters  │ - Search        │ - Contact info     │
│ - Sync btn │ - List items    │ - Edit/Delete      │
│            │ - Bulk bar      │ - Activity         │
└────────────┴─────────────────┴────────────────────┘
```

### 2.2 ContactList
**File:** `frontend/components/contacts/ContactList.tsx`

Similar to `ThreadList.tsx`:
- Virtualized list
- IntersectionObserver for infinite scroll
- Multi-selection support
- Loading/empty states
- React.memo for performance

Props:
```typescript
interface ContactListProps {
  contacts: Contact[];
  selectedId?: string;
  selectedIds?: Set<string>;
  isLoading?: boolean;
  onContactClick?: (contact: Contact) => void;
  onToggleSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
}
```

### 2.3 ContactListItem
**File:** `frontend/components/contacts/ContactListItem.tsx`

Similar to `ThreadListItem.tsx`:
- Checkbox for multi-selection
- Avatar
- Contact info (name, email, company)
- Hover action bar
- React.memo with proper comparison

Props:
```typescript
interface ContactListItemProps {
  contact: Contact;
  selected?: boolean;
  multiSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onClick?: () => void;
}
```

### 2.4 ContactActionBar (hover)
**File:** `frontend/components/contacts/ContactActionBar.tsx`

Floating action bar on hover:
- Edit button
- Delete button
- Email button (compose to contact)
- Call button (if phone)

### 2.5 ContactBulkActionBar
**File:** `frontend/components/contacts/ContactBulkActionBar.tsx`

Similar to `BulkActionBar.tsx`:
- Shows when contacts selected
- Select all / Clear selection
- Bulk delete
- Export (future)

```typescript
interface ContactBulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDelete: () => Promise<void>;
  onExport?: () => Promise<void>;
}
```

### 2.6 ContactSidebar
**File:** `frontend/components/contacts/ContactSidebar.tsx`

Sidebar with:
- New Contact button
- Sync button
- Provider filters (Google, Microsoft)
- Quick filters (has email, has phone, etc.)
- Search

### 2.7 ContactDetail
**File:** `frontend/components/contacts/ContactDetail.tsx`

Detail panel (extract from current Contacts.tsx):
- Contact header with avatar
- Contact info sections
- Tabs (Details, Activity, Notes)
- Edit/Delete buttons

---

## Phase 3: Fix Infinite Scroll

Current issue: `loadContacts` dependency causes infinite loop.

Fix already applied - ensure it works:
1. Remove `storeContacts` from `loadContacts` dependencies
2. Use `useContactStore.getState().contacts` inside callback
3. IntersectionObserver on sentinel element at list end
4. Proper loading states to prevent double-loading

```typescript
// ContactList.tsx
useEffect(() => {
  if (!onLoadMore || !hasMore || isLoading) return;

  const sentinel = sentinelRef.current;
  if (!sentinel) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        onLoadMore();
      }
    },
    { rootMargin: '100px', threshold: 0.1 }
  );

  observer.observe(sentinel);
  return () => observer.disconnect();
}, [onLoadMore, hasMore, isLoading]);
```

---

## Phase 4: Main Contacts Page

### File: `frontend/components/dashboard/Contacts.tsx`

Refactor to orchestration only (like Mailbox.tsx):
- Wire up all components
- Handle API calls
- Manage WebSocket events
- ~200-300 lines instead of 1400+

Structure:
```tsx
export function Contacts() {
  // Store hooks
  const { contacts, setContacts, selectedIds, ... } = useContactStore();

  // Local state
  const [selectedContact, setSelectedContact] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Load data
  const loadContacts = useCallback(async () => { ... }, []);

  // Bulk handlers
  const handleBulkDelete = useCallback(async () => { ... }, []);

  return (
    <ContactLayout
      sidebar={<ContactSidebar ... />}
      list={
        <>
          <ContactBulkActionBar ... />
          <ContactList ... />
        </>
      }
      detail={selectedContact ? <ContactDetail ... /> : null}
      showDetail={!!selectedContact}
    />
  );
}
```

---

## Phase 5: WebSocket Integration

Already partially done - ensure full coverage:

```typescript
// In Contacts.tsx
useEffect(() => {
  const handleNew = (event) => {
    useContactStore.getState().addContact(await fetchContact(event.contactId));
  };

  const handleUpdate = (event) => {
    useContactStore.getState().updateContact(event.contactId, await fetchContact(event.contactId));
  };

  const handleDelete = (event) => {
    useContactStore.getState().deleteContact(event.contactId);
  };

  // Subscribe
  const unsubs = [
    websocketClient.onContactNew(handleNew),
    websocketClient.onContactUpdate(handleUpdate),
    websocketClient.onContactDelete(handleDelete),
  ];

  return () => unsubs.forEach(u => u());
}, []);
```

---

## File Structure After Refactor

```
frontend/
├── components/
│   ├── contacts/
│   │   ├── index.ts              # Exports
│   │   ├── ContactLayout.tsx     # 3-panel layout
│   │   ├── ContactList.tsx       # List with infinite scroll
│   │   ├── ContactListItem.tsx   # Individual item
│   │   ├── ContactActionBar.tsx  # Hover actions
│   │   ├── ContactBulkActionBar.tsx  # Bulk operations
│   │   ├── ContactSidebar.tsx    # Sidebar/filters
│   │   └── ContactDetail.tsx     # Detail panel
│   └── dashboard/
│       └── Contacts.tsx          # Main orchestrator (slimmed down)
├── stores/
│   └── contact-store.ts          # Enhanced store
└── pages/dashboard/
    └── contacts.tsx              # Page wrapper
```

---

## Implementation Order

1. **Store Enhancement** (~30 min)
   - Add pagination, selection, bulk actions to store

2. **ContactLayout** (~20 min)
   - Copy/adapt from EmailLayout

3. **ContactListItem** (~30 min)
   - Checkbox, avatar, info, hover actions

4. **ContactList** (~30 min)
   - List with infinite scroll, selection

5. **ContactBulkActionBar** (~20 min)
   - Bulk delete, select all/clear

6. **ContactSidebar** (~30 min)
   - Filters, sync button, new contact

7. **ContactDetail** (~40 min)
   - Extract from current Contacts.tsx

8. **Wire Everything** (~60 min)
   - Refactor main Contacts.tsx to use new components
   - Test all functionality

9. **Testing & Polish** (~30 min)
   - Fix any bugs
   - Ensure UI consistency with Email

**Total estimated effort: 4-5 hours**

---

## Translation Keys Needed

Add to `frontend/locales/app-translations.ts`:

```typescript
contacts: {
  bulkBar: {
    selected: '{count} selected',
    selectAll: 'Select all',
    delete: 'Delete',
    export: 'Export',
  },
  filters: {
    allProviders: 'All Providers',
    hasEmail: 'Has email',
    hasPhone: 'Has phone',
  },
  actions: {
    edit: 'Edit',
    delete: 'Delete',
    email: 'Send email',
    call: 'Call',
  },
  empty: {
    title: 'No contacts',
    subtitle: 'Add contacts or sync from providers',
  },
}
```

---

## Success Criteria

- [ ] Infinite scroll works correctly
- [ ] Multi-selection with checkboxes
- [ ] Bulk delete works
- [ ] UI matches Email component style
- [ ] WebSocket updates work in real-time
- [ ] Mobile responsive
- [ ] No performance issues with 1000+ contacts
- [ ] Code split into maintainable modules

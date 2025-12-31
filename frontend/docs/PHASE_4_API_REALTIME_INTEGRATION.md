# Phase 4: API Integration & Realtime Updates

**Date**: 2025-12-31
**Status**: Completed (Steps 1-4)

## Overview

Connect frontend email components to backend API with WebSocket realtime updates for live data synchronization.

## Architecture Summary

### Backend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| EmailsController | `backend/src/modules/email/controllers/emails.controller.ts` | REST API endpoints |
| RealtimeGateway | `backend/src/modules/realtime/gateways/realtime.gateway.ts` | WebSocket server |
| RealtimeEventsService | `backend/src/modules/realtime/services/realtime-events.service.ts` | Event emission with buffering |

### Frontend Components

| Component | Location | Status | Purpose |
|-----------|----------|--------|---------|
| WebSocket Client | `lib/websocket-client.ts` | Existing | Singleton Socket.io client |
| Email API | `lib/api/emails.ts` | Existing | REST API module |
| Query Hooks | `hooks/queries/use-emails.ts` | Existing | TanStack Query hooks |
| useWebSocket | `hooks/use-websocket.ts` | NEW | Connection lifecycle management |
| useEmailRealtime | `hooks/use-email-realtime.ts` | NEW | Event to Query invalidation |
| Email Page | `pages/dashboard/email.tsx` | Updated | Connected to mutations |

## Backend API Endpoints

### Email CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/emails` | List emails with pagination and filters |
| GET | `/emails/:id` | Get single email |
| GET | `/emails/thread/:threadId` | Get all emails in thread |
| GET | `/emails/conversations` | Get threaded conversations |
| GET | `/emails/stats` | Get email statistics |
| GET | `/emails/search?q=query` | Search emails |
| POST | `/emails/send` | Send new email |
| POST | `/emails/:id/reply` | Reply to email |
| POST | `/emails/:id/forward` | Forward email |
| PATCH | `/emails/:id` | Update email flags |
| DELETE | `/emails/:id` | Delete email |

### Bulk Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| DELETE | `/emails/bulk` | Bulk delete |
| PATCH | `/emails/bulk/read` | Bulk mark read/unread |
| PATCH | `/emails/bulk/star` | Bulk star/unstar |
| PATCH | `/emails/bulk/flag` | Bulk flag/unflag |
| PATCH | `/emails/bulk/move` | Bulk move to folder |
| PATCH | `/emails/bulk/labels/add` | Bulk add labels |
| PATCH | `/emails/bulk/labels/remove` | Bulk remove labels |

## WebSocket Realtime Events

### Connection

- **Namespace**: `/realtime`
- **Auth**: JWT token in handshake
- **Rooms**: `tenant:${tenantId}` for multi-tenant isolation

### Email Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `email:new` | EmailEventPayload | New email received |
| `email:update` | EmailEventPayload | Email flags changed |
| `email:delete` | EmailEventPayload | Email deleted |
| `email:batch_processed` | providerId, processed, created, syncType | Bulk sync complete |
| `email:unread_count_update` | folder, count, providerId | Unread count changed |
| `email:folder_counts_update` | folderId, totalCount, unreadCount | Folder counts changed |
| `email:thread_update` | threadId, emailIds | Thread updated |

### Sync Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `sync:status` | providerId, status, progress, error | Sync progress updates |

## Implementation Status

### Step 1: Create useEmailRealtime Hook (Done)

**File**: `hooks/use-email-realtime.ts`

Connects WebSocket events to TanStack Query cache invalidation:

```typescript
export function useEmailRealtime(options: UseEmailRealtimeOptions = {}) {
  const { folder, enabled = true } = options;
  const queryClient = useQueryClient();

  // Subscribe to all email events
  useEffect(() => {
    if (!enabled) return;

    const unsubNew = websocketClient.onEmailNew(handleEmailNew);
    const unsubUpdate = websocketClient.onEmailUpdate(handleEmailUpdate);
    const unsubDelete = websocketClient.onEmailDelete(handleEmailDelete);
    // ... more handlers

    return () => {
      unsubNew();
      unsubUpdate();
      unsubDelete();
      // ... cleanup all
    };
  }, [enabled, /* handlers */]);
}
```

**Key Design Decisions**:

- Handlers wrapped in `useCallback` with proper dependencies
- Cleanup function unsubscribes all event listeners (prevents memory leaks)
- Optional folder filter for targeted invalidation
- `isConnected` return is a snapshot (not reactive) - use `useWebSocket` for reactive state

### Step 2: Enable WebSocket in Layout (Done)

**File**: `components/layout/Layout.tsx`

```typescript
export function Layout({ children }: LayoutProps) {
  useAuth(); // Session management
  useWebSocket({ autoConnect: true, refetchOnReconnect: true });
  // ...
}
```

**File**: `hooks/use-websocket.ts`

Manages WebSocket connection lifecycle:

- Auto-connects when authenticated
- Handles reconnection with data refetch
- Handles auth failures (triggers logout)
- Uses refs to prevent duplicate connections

**Key Design Decisions**:

- Connection managed at Layout level (singleton pattern)
- No disconnect on unmount (other components may depend on connection)
- Refs track connection attempts to prevent race conditions

### Step 3: Connect TODO Handlers (Done)

**File**: `pages/dashboard/email.tsx`

Connected all handlers to mutation hooks:

| Handler | Hook | Description |
|---------|------|-------------|
| `handleBulkMarkAsRead` | `useBulkMarkRead` | Bulk mark read |
| `handleBulkMarkAsUnread` | `useBulkMarkRead` | Bulk mark unread |
| `handleBulkArchive` | `useBulkMoveEmails` | Bulk archive |
| `handleBulkDelete` | `useBulkDeleteEmails` | Bulk delete |
| `handleFlag` | `useUpdateEmail` | Toggle flag |
| `handleArchive` | `useBulkMoveEmails` | Single archive |
| `handleDelete` | `useDeleteEmail` | Single delete |

**Toast Notifications**:

- Success: `t.common.success` (with fallback)
- Error: `t.common.genericError`

### Step 4: Verification (Done)

- TypeScript compilation passes (`npx tsc --noEmit`)
- Backend server healthy (port 3000)
- Frontend dev server running (port 3001)
- WebSocket client has all required event handlers

### Step 5: Thread Detail Navigation (Pending)

Add thread detail view:

- Click handler navigates to thread
- Use `useEmailThread(threadId)` hook
- Render ThreadView component

## Best Practices Applied

### TanStack Query + WebSocket

1. **Invalidate, don't update**: On WebSocket events, invalidate queries instead of manually updating cache
2. **Debounce events**: Backend buffers events (200ms) to prevent storm
3. **Reconnection handling**: Re-fetch stale data after reconnect

### Memory Leak Prevention

1. All event subscriptions return cleanup functions
2. useEffect cleanup calls all unsubscribe functions
3. Handlers wrapped in useCallback with stable dependencies

### Race Condition Prevention

1. Refs track connection attempts (`connectionAttemptedRef`)
2. Token changes reset connection state (`currentTokenRef`)
3. Early returns prevent duplicate operations

## File Changes Summary

| File | Change | Lines |
|------|--------|-------|
| `hooks/use-email-realtime.ts` | NEW | 221 |
| `hooks/use-websocket.ts` | NEW | 200 |
| `components/layout/Layout.tsx` | Added useWebSocket | +2 |
| `pages/dashboard/email.tsx` | Connected handlers to mutations | ~50 |
| `locales/en.ts` | Added `success` translation | +1 |
| `locales/it.ts` | Added `success` translation | +1 |
| `locales/index.ts` | Added `success` type | +1 |

## References

- [TkDodo's Blog: WebSocket + React Query](https://tkdodo.eu/blog/using-web-sockets-with-react-query)
- [TanStack Query: Query Invalidation](https://tanstack.com/query/latest/docs/react/guides/query-invalidation)
- Backend realtime docs: `backend/src/modules/realtime/`

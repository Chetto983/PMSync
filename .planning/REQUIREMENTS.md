# Requirements: PMSync v8.0

**Defined:** 2026-03-23
**Core Value:** The best professional AI mail client -- fast, intelligent, and secure

## v8.0 Requirements

Requirements for Progressive Web App milestone. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: User sees PMSync as installable app with correct name, icons, and theme colors on all platforms
- [x] **FOUND-02**: Service worker registers on first visit and precaches static assets (JS, CSS, fonts)
- [x] **FOUND-03**: Service worker updates correctly on new deploys (no stale SW via Vercel edge caching)
- [x] **FOUND-04**: SW never intercepts `/api/*` requests (preserves httpOnly cookie auth, TanStack Query caching, SSE streaming)

### Offline

- [ ] **OFFL-01**: User sees branded offline fallback page instead of browser error when navigating to uncached route without network
- [ ] **OFFL-02**: User sees online/offline indicator banner when connection drops or restores
- [ ] **OFFL-03**: User can read recently-synced inbox emails after closing and reopening app without network (TanStack Query persist to IndexedDB)
- [ ] **OFFL-04**: App shell (navigation, layout) loads from cache for instant startup even without network

### Install

- [ ] **INST-01**: User on Android/desktop Chrome sees install prompt via beforeinstallprompt with dismiss/accept
- [ ] **INST-02**: User on iOS sees "Add to Home Screen" instructions with share icon guidance
- [ ] **INST-03**: Install prompt hidden when app already running in standalone mode

### Push

- [ ] **PUSH-01**: User can opt into push notifications from settings page (VAPID subscription via PushManager)
- [ ] **PUSH-02**: Service worker handles push events and displays notifications with app icon
- [ ] **PUSH-03**: User tapping notification opens PMSync to relevant view
- [ ] **PUSH-04**: Push subscription UI gated behind browser support check (hidden on unsupported browsers/iOS Safari non-standalone)

### Sync

- [ ] **SYNC-01**: User can mark-read, archive, and star emails while offline — actions queue in IndexedDB
- [ ] **SYNC-02**: Queued actions replay automatically when connection restores (online event + BackgroundSync progressive enhancement)
- [ ] **SYNC-03**: Queued actions older than 30 minutes are discarded with user notification
- [ ] **SYNC-04**: All IndexedDB data and SW caches cleared on user sign-out (security)

### Polish

- [ ] **PLSH-01**: "New version available" snackbar appears on deploy with user-triggered reload (skipWaiting)
- [ ] **PLSH-02**: Lighthouse PWA audit category passes (installable + service worker + offline fallback)

## Future Requirements

Deferred to v8.x+ or v9.0.

### Push Backend Integration

- **PUSHB-01**: Backend email sync triggers push notification to subscribed devices
- **PUSHB-02**: Notification action buttons (Reply, Archive) from notification tray

### Advanced Offline

- **ADVOF-01**: TanStack Query persistQueryClient bridge for cold-start hydration optimization
- **ADVOF-02**: Badge API unread count on app icon (Chrome/Android only)
- **ADVOF-03**: Full offline compose-and-send with SMTP queue

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backend push triggers (BullMQ -> web-push) | Scoped as frontend-only milestone; backend integration deferred to v9+ |
| Full offline-first architecture with conflict resolution | Exceeds PWA scope; would require CRDT or similar sync strategy |
| Native app (Capacitor/Tauri) | Web-first strategy; PWA provides native-like experience |
| Notification action buttons | Requires backend push triggers which are out of scope |
| SW caching of API responses | httpOnly cookie auth makes SW fetch interception a credential hazard |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 100 | Complete |
| FOUND-02 | Phase 100 | Complete |
| FOUND-03 | Phase 100 | Complete |
| FOUND-04 | Phase 100 | Complete |
| OFFL-01 | Phase 101 | Pending |
| OFFL-02 | Phase 101 | Pending |
| OFFL-03 | Phase 103 | Pending |
| OFFL-04 | Phase 101 | Pending |
| INST-01 | Phase 102 | Pending |
| INST-02 | Phase 102 | Pending |
| INST-03 | Phase 102 | Pending |
| PUSH-01 | Phase 105 | Pending |
| PUSH-02 | Phase 105 | Pending |
| PUSH-03 | Phase 105 | Pending |
| PUSH-04 | Phase 105 | Pending |
| SYNC-01 | Phase 104 | Pending |
| SYNC-02 | Phase 104 | Pending |
| SYNC-03 | Phase 104 | Pending |
| SYNC-04 | Phase 103 | Pending |
| PLSH-01 | Phase 105 | Pending |
| PLSH-02 | Phase 105 | Pending |

**Coverage:**
- v8.0 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after roadmap creation*

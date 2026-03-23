# Roadmap: PMSync

## Milestones

- ✅ **v1 Stability & Code Quality Refactor** — Phases 1-8 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** — Phases 1-8 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** — Phases 01-03 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** — Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** — Phases 13-22 (shipped 2026-02-27)
- ✅ **v3.2 AI Rebuild & Cleanup** — Phases 23-28 (shipped 2026-03-03, partial)
- ✅ **v4.0 Enterprise Stabilization** — Phases 31-41 (shipped 2026-03-04)
- ✅ **v4.1 Security Hardening & Debt Reduction** — Phases 42-49 (shipped 2026-03-06)
- ✅ **v5.0 better-auth Migration** — Phases 50-65 (shipped 2026-03-10)
- ✅ **v5.1 Test Coverage & Polish** — Phases 66-76 (shipped 2026-03-15)
- ✅ **v6.0 Enterprise Platform & AI Governance** — Phases 77-88 (partial, archived 2026-03-20)
- ✅ **v7.0 System Audit & Hardening** — Phases 89-99 (shipped 2026-03-23)
- **v8.0 Progressive Web App** — Phases 100-105 (in progress)

## Phases

<details>
<summary>✅ v1 Stability & Code Quality Refactor (Phases 1-8) — SHIPPED 2026-02-02</summary>

8 phases, 40 plans. See `milestones/v1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.0 Professional Email Client (Phases 1-8) — SHIPPED 2026-02-04</summary>

8 phases, 21 plans, 24/24 requirements. See `milestones/v2.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v2.1 Optimization & Polish (Phases 01-03) — SHIPPED 2026-02-05</summary>

3 phases, 5 plans. See `milestones/v2.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.0 AI Intelligence & Scalability (Phases 1-12) — SHIPPED 2026-02-09</summary>

12 phases, 42 plans, 19/19 requirements. See `milestones/v3.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) — SHIPPED 2026-02-27</summary>

10 phases, 34 plans, 31/32 requirements (ENC-03 deferred). See `milestones/v3.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v3.2 AI Rebuild & Cleanup (Phases 23-28) — SHIPPED 2026-03-03 (partial)</summary>

6 phases, 20 plans, 25/33 requirements (8 carried to v4.0). See `milestones/v3.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.0 Enterprise Stabilization (Phases 31-41) — SHIPPED 2026-03-04</summary>

11 phases, 22 plans, 19/19 requirements. See `milestones/v4.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v4.1 Security Hardening & Debt Reduction (Phases 42-49) — SHIPPED 2026-03-06</summary>

8 phases, 28 plans, 65/66 requirements. See `milestones/v4.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.0 better-auth Migration (Phases 50-65) — SHIPPED 2026-03-10</summary>

15 phases, 34 plans, 51/51 requirements. See `milestones/v5.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v5.1 Test Coverage & Polish (Phases 66-76) — SHIPPED 2026-03-15</summary>

11 phases, 30 plans. See `milestones/v5.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v6.0 Enterprise Platform & AI Governance (Phases 77-88) — PARTIAL, archived 2026-03-20</summary>

12 phases (77-88), 4/66 requirements completed. Phases 86-88 (bug fixes) completed. Phases 77-85 (enterprise features) deferred to v8.0+. See `milestones/v6.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v7.0 System Audit & Hardening (Phases 89-99) — SHIPPED 2026-03-23</summary>

10 active phases + 1 obsolete (97), 35 plans, 65/65 requirements. See `milestones/v7.0-ROADMAP.md` for full details.

</details>

### v8.0 Progressive Web App (In Progress)

**Milestone Goal:** Transform PMSync into a full PWA -- installable on home screen, offline email reading, push notification frontend plumbing, and native-like install experience. Frontend-only scope; no backend push triggers.

**Phase Numbering:**
- Integer phases (100-105): Planned v8.0 milestone work
- Decimal phases (e.g., 100.1): Urgent insertions if needed (marked with INSERTED)

- [x] **Phase 100: PWA Foundation** - Web app manifest, service worker registration, icon set, Vercel cache headers (completed 2026-03-23)
- [x] **Phase 101: Offline Shell** - Offline fallback page, online/offline indicator, app shell caching (completed 2026-03-23)
- [x] **Phase 102: Install Experience** - beforeinstallprompt for Android/desktop, iOS instructions, standalone detection (completed 2026-03-23)
- [x] **Phase 103: Offline Email Reading** - TanStack Query persist to IndexedDB, cache-on-logout security (completed 2026-03-23)
- [ ] **Phase 104: Background Sync** - Offline mutation queue, replay on reconnect, queue TTL with notification
- [ ] **Phase 105: Push Plumbing & Polish** - VAPID subscription UI, SW push handler, SW update notification, Lighthouse PWA audit

## Phase Details

### Phase 100: PWA Foundation
**Goal**: PMSync is recognized as an installable PWA with a registered service worker serving precached static assets
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. User sees correct app name, theme color, and icons when adding PMSync to home screen on Android, iOS, and desktop
  2. Service worker activates on first visit and subsequent page loads serve static assets (JS, CSS, fonts) from SW cache
  3. Deploying a new version on Vercel causes the browser to detect the updated sw.js within 24 hours (no stale SW caching)
  4. All /api/* requests bypass the service worker entirely -- no 401s, no SSE corruption, no TanStack Query interference
**Plans:** 2/2 plans complete
Plans:
- [ ] 100-01-PLAN.md -- Install Serwist, create manifest + icons + Apple meta tags
- [ ] 100-02-PLAN.md -- Create SW source, wrap next.config, Vercel headers, .gitignore

### Phase 101: Offline Shell
**Goal**: PMSync opens from home screen and renders its shell even without network, with clear offline status indication
**Depends on**: Phase 100
**Requirements**: OFFL-01, OFFL-02, OFFL-04
**Success Criteria** (what must be TRUE):
  1. User navigating to an uncached route without network sees a branded PMSync offline page instead of the browser error
  2. User sees a visible banner when connection drops and the banner disappears when connection restores
  3. App shell (sidebar, top bar, layout chrome) loads instantly from cache when opening the app offline
**Plans:** 1/1 plans complete
Plans:
- [ ] 101-01-PLAN.md -- Offline fallback page, SW fallbacks config, online/offline banner, useOnlineStatus hook

### Phase 102: Install Experience
**Goal**: Users on all platforms get a clear path to install PMSync as a standalone app
**Depends on**: Phase 100
**Requirements**: INST-01, INST-02, INST-03
**Success Criteria** (what must be TRUE):
  1. User on Android or desktop Chrome sees a dismissible install prompt with accept/dismiss actions
  2. User on iOS Safari sees instructions to tap the share icon and select "Add to Home Screen"
  3. Install prompt is hidden when the app is already running in standalone mode (no redundant prompt)
**Plans:** 2/2 plans complete
Plans:
- [ ] 102-01-PLAN.md -- Translations + useInstallPrompt hook + unit tests
- [ ] 102-02-PLAN.md -- InstallPromptBanner component + Layout wiring

### Phase 103: Offline Email Reading
**Goal**: Users can read their recently-synced emails after closing and reopening the app without network
**Depends on**: Phase 101
**Requirements**: OFFL-03, SYNC-04
**Success Criteria** (what must be TRUE):
  1. User can open PMSync offline, see their inbox list, and read email bodies that were previously loaded while online
  2. All IndexedDB persisted data and SW caches are cleared when the user signs out (no data leaks between sessions)
**Plans:** 2/2 plans complete
Plans:
- [ ] 103-01-PLAN.md -- Install persistence packages, create query-persist module, wire into QueryClient
- [ ] 103-02-PLAN.md -- Create logout-cleanup module, wire into Header sign-out flow

### Phase 104: Background Sync
**Goal**: Users can perform email actions while offline and have them sync automatically when connectivity returns
**Depends on**: Phase 103
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):
  1. User can mark-read, archive, and star emails while offline -- actions are visually applied immediately and queued in IndexedDB
  2. Queued actions replay automatically when the device reconnects (via online event; BackgroundSync as Chromium-only enhancement)
  3. Queued actions older than 30 minutes are discarded and the user sees a notification explaining the expiry
**Plans:** 1/2 plans executed
Plans:
- [ ] 104-01-PLAN.md -- OfflineActionQueue module, Zustand store, translations, useUpdateEmail offline interception
- [ ] 104-02-PLAN.md -- Replay engine hook, SW sync handler, OfflineBanner badge, logout cleanup wiring

### Phase 105: Push Plumbing & Polish
**Goal**: Push notification frontend infrastructure is wired and PMSync passes Lighthouse PWA audit
**Depends on**: Phase 100
**Requirements**: PUSH-01, PUSH-02, PUSH-03, PUSH-04, PLSH-01, PLSH-02
**Success Criteria** (what must be TRUE):
  1. User can opt into push notifications from the settings page and the VAPID subscription is sent to the backend
  2. Service worker handles incoming push events and displays a notification with the PMSync icon
  3. User tapping a push notification opens PMSync to the relevant view
  4. Push subscription UI is hidden on browsers that do not support PushManager or on iOS Safari outside standalone mode
  5. User sees a "New version available" snackbar after a deploy and can trigger a reload to activate the new service worker
**Plans:** 2 plans
Plans:
- [ ] 102-01-PLAN.md -- Translations + useInstallPrompt hook + unit tests
- [ ] 102-02-PLAN.md -- InstallPromptBanner component + Layout wiring

## Progress

**Execution Order:**
Phases execute in numeric order: 100 -> 101 -> 102 -> 103 -> 104 -> 105

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 100. PWA Foundation | 2/2 | Complete    | 2026-03-23 | - |
| 101. Offline Shell | 1/1 | Complete    | 2026-03-23 | - |
| 102. Install Experience | 2/2 | Complete    | 2026-03-23 | - |
| 103. Offline Email Reading | 2/2 | Complete    | 2026-03-23 | - |
| 104. Background Sync | 1/2 | In Progress|  | - |
| 105. Push Plumbing & Polish | v8.0 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-09*
*v7.0 completed: 2026-03-23 -- 10 phases, 35 plans, 65/65 requirements*
*v8.0 roadmap created: 2026-03-23 -- 6 phases, 21 requirements*

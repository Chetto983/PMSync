# Email UI Final Hardening Roadmap (Production Readiness)

Scope: `frontend/components/email`, websocket-driven freshness, and UX resilience.
Status key: ✅ done, 🔄 in-progress, ⏳ planned, 🛠️ optional.

## 1) Connectivity Resilience
- ✅ Add websocket close/error listeners in `useWebSocket` to immediately flip `connectionStatus` and trigger backoff.
- ✅ Exponential backoff + status exposure; connection chip shows connecting/live/reconnecting.
- ⏳ User-facing notice when disconnected (toast/banner near list/sidebar).

## 2) Touch/Accessibility for Actions
- ⏳ Make hover-only thread actions reachable on touch/keyboard (always-visible overflow button on mobile; `aria-label`s + focus states).
- ⏳ Add shortcut/help hint for bulk actions (e.g., select all, mark read).

## 3) Empty/Contextual States
- ⏳ Tailor empty-state messaging per folder/smart-filter (Inbox vs Sent vs Trash vs label).
- ✅ Thread and list empty/loading states exist.

## 4) Attachment UX Clarity
- 🔄 Add tooltip/inline hint on attachment chips explaining click vs Ctrl/Cmd+click behavior.
- ✅ Attachment handling uses shared helper; non-inline filter and icons are consistent.

## 5) Realtime/Store Reactivity
- ✅ Tests cover WS handlers (new/update/delete/thread/counts) and list/detail reactivity for thread counts.
- ⏳ Add a minimal UI indicator if thread data is stale after failed reconnect attempts.

## 6) Logging & Noise
- ✅ Gate websocket console logs by environment (reduce production noise; keep debug flag).
- ✅ Test logs stubbed.

## 7) QA Checklist (per release)
- ✅ `npm run lint`
- ✅ `npm run test -- ThreadListItem ThreadList use-websocket ThreadDisplay email-utils`
- ✅ `npm run build`
- ⏳ Manual sanity: websocket drop/reconnect (status updates), touch action affordance, attachment click/download hint, folder-specific empty states.

## Next steps to execute
1) Add disconnected toast/banner and optional folder-header status dot.  
2) Touch/keyboard-friendly action affordance on thread items.  
3) Attachment tooltip for click vs download.  
4) Folder-specific empty-state copy.  
5) Manual sanity pass and rerun lint/test/build.

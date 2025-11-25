# Intelligent Secretary UI Plan (Frontend)

Scope: surface multi-agent/HITL features in the app with clear approvals, context, and proactive assistance.

Surfaces
- Dashboard AI (`pages/dashboard/ai.tsx`): chat + action panel for proposed actions (approve/reject/edit), confidence/severity chips, citations, streaming responses, quick actions (smart reply, schedule, dedupe).
- Pending actions inbox (new): list `agent_pending_actions` with filters (type/status/severity), inline approve/reject, payload preview, realtime updates.
- Email (`pages/dashboard/email.tsx` + `components/email/*`): smart replies, triage chips, thread summary sidebar, task extraction; approval banners for send/archive/categorize.
- Calendar (`pages/dashboard/calendar.tsx`): scheduling drawer with proposed slots/attendees/agenda; reschedule suggestions; approval flow for event creation.
- Contacts (`pages/dashboard/contacts.tsx`): dedupe/enrich panel with similarity scores; bulk approve/reject.
- Landing (`components/landing/*`): feature block describing “Intelligent Secretary” (proactive suggestions, safe approvals, RAG answers).

State & UX cues
- Confidence/severity badges on every proposed action; HITL-required banner for high-impact actions.
- Streaming indicators for long LLM/tool runs; retry/resume buttons.
- Notifications/toasts for new pending actions; badge counter in header.
- Persona/tone selector in AI input; optional citations toggle.

API wiring (expected)
- Sessions/messages: `/ai/multi-agent/session`, `/ai/multi-agent/message`.
- Pending actions: `/ai/hitl/actions`, `/ai/hitl/actions/:id/approve|reject`.
- Context fetches: email threads, contacts, calendar events to enrich prompts/UI.

Components to build
- `<ActionList/>` for proposed actions (type, payload summary, confidence, severity, approve/reject/edit).
- `<PendingActionsTable/>` for HITL inbox with filters and pagination.
- `<SummarySidebar/>` for thread summaries, tasks, citations.
- `<SchedulingDrawer/>` for slots/agenda proposals with approval.
- `<DedupeList/>` for contacts merges with similarity display.

Next steps
- Add routes/pages for HITL inbox and wire to real APIs.
- Extend AI page with action panel + quick actions.
- Add realtime subscription for pending actions (use existing realtime module).
- Update landing “modules/features” to highlight Intelligent Secretary with CTA to dashboard AI.

UI/UX references (for implementation)
- Accessibility + forms: https://mui.com/material-ui/react-text-field/, https://mui.com/material-ui/react-data-grid/
- Dashboard/table patterns: https://mui.com/x/react-data-grid/ and https://mui.com/material-ui/react-card/
- Toasts/notifications: https://notistack.com/ (MUI snackbar helper)
- Loading/streaming affordances: https://mui.com/material-ui/react-progress/
- UX for approvals: https://www.nngroup.com/articles/dialog-design/ (Nielsen Norman—dialogs/confirmations best practices)

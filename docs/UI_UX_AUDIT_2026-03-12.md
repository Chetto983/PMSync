# UI/UX Audit - 2026-03-12

## Scope

- Target app: `https://mail-agent-indol.vercel.app`
- Auth state: authenticated user session provided in live Playwright browser
- Audit mode: manual interactive audit using Playwright MCP
- Breakpoints covered:
  - Desktop: `1440x900`
  - Small desktop: `1024x800`
  - Tablet: `768x1024`
  - Mobile: `375x812`

## Screens Audited

- `/dashboard`
- `/dashboard/email`
- `/dashboard/contacts`
- `/dashboard/settings`
- `/dashboard/settings?section=security`
- `/dashboard/admin/users`
- `/dashboard/admin/organizations`

## Method

- Reproduced flows in the deployed app, not local dev
- Checked navigation shell, primary actions, empty states, settings flows, and responsive behavior
- Reviewed console and network activity where the UI suggested failure or degraded behavior
- Evaluated findings against UX anti-patterns:
  - feedback and responsiveness
  - error handling and recovery
  - mobile and viewport-specific behavior
  - accessibility as UX
  - navigation and state clarity

## Findings

### 1. Mobile security screen clips the primary TOTP action

- Severity: High
- URL: `/dashboard/settings?section=security`
- Viewport: `375x812`
- Category: Mobile & viewport-specific, feedback & responsiveness

#### What happens

On the "Autenticazione a due fattori" card, the `Attiva TOTP` action is visibly clipped on the right edge. The CTA label is not fully readable and the card content is too dense for the available width.

#### User harm

- Primary account-security setup looks broken on mobile
- The user cannot quickly trust or parse the action they are being asked to take
- A security-critical action appears visually unstable, which reduces confidence

#### Evidence

- The mobile security view shows the button cut off at the card boundary
- The same page otherwise renders, so this is not a loading issue

#### Fix direction

- Stack the TOTP status and CTA vertically below the explanatory copy on phone widths
- Reserve full-width CTA space for security actions below `sm`
- Add explicit min-width and wrapping rules for action rows in MFA cards

### 2. Admin routes fail into a generic error state instead of a role-aware explanation

- Severity: High
- URLs:
  - `/dashboard/admin/users`
  - `/dashboard/admin/organizations`
- Viewports:
  - `1440x900`
  - `375x812`
- Category: Error handling & recovery

#### What happens

Both admin routes load a `Caricamento...` state and then collapse into the generic message `Qualcosa è andato storto. Riprova.` The failure reproduces on both desktop and mobile. The UI does not explain whether the problem is missing permissions, missing org role, backend failure, or unsupported account type.

#### User harm

- The user has no recovery path
- The system hides the actual constraint behind a generic error
- Admin workflows look broken even if the real issue is authorization

#### Evidence

- Same degraded state on both admin routes
- Same degraded state on both wide and narrow viewports
- No explanatory callout, role guidance, or link back to a valid route

#### Fix direction

- Distinguish `403/401` access states from true load failures
- Replace the generic fallback with:
  - `You do not have access to this area`
  - current role context
  - a path back to a valid screen
  - optional contact/admin escalation text
- Only use the current generic error state for actual unexpected exceptions

### 3. Mobile inbox toolbar is over-compressed and deprioritizes search

- Severity: Medium
- URL: `/dashboard/email`
- Viewport: `375x812`
- Category: Mobile & viewport-specific, layout stability

#### What happens

The top inbox toolbar squeezes the bulk-select checkbox, message count, search box, and refresh action into a single narrow row. The search placeholder truncates immediately and the layout reads as crowded before the user has done anything.

#### User harm

- Search discoverability is reduced in a core productivity view
- The first visible controls feel cramped and low-confidence
- Empty-state clarity is undercut by a cluttered toolbar above it

#### Evidence

- Search placeholder is truncated on load
- `0 emails` and the checkbox consume space without helping the empty-state task

#### Fix direction

- Split the toolbar into two rows on phone widths
- Give search the full first row
- Move selection state and refresh into a second, lighter row
- Hide non-essential count chrome when the list is empty

### 4. Mixed localization in authenticated flows breaks polish and trust

- Severity: Medium
- URLs:
  - `/dashboard`
  - `/dashboard/settings`
- Viewports: observed on desktop, tablet, and mobile
- Category: Feedback & responsiveness, cumulative UX quality

#### What happens

The authenticated UI is mostly Italian, but key strings remain English. Examples observed during the audit:

- `Save` on the general settings page
- `March 2026` in dashboard priority email content/date presentation
- `Show password` on password visibility buttons

#### User harm

- The product feels partially translated and unfinished
- Users must context-switch language in action-heavy areas
- Trust drops fastest in settings and security surfaces where clarity should be highest

#### Fix direction

- Run an i18n audit on authenticated shell, settings actions, date formatting, and form helper controls
- Localize control labels coming from shared form components, not only page copy
- Ensure locale-aware date formatting uses the active language, not a default English formatter

### 5. Disabled actions are shown without explanation in high-impact areas

- Severity: Medium
- URLs:
  - `/dashboard/contacts`
  - `/dashboard/settings?section=security`
- Viewports: most visible on mobile
- Category: Error handling & recovery

#### What happens

Several disabled actions appear with no explanation:

- In contacts, the contact detail sheet shows a disabled `Email` CTA with no reason
- In security, the connected Google account shows a disabled `Scollega` button with no rationale

#### User harm

- The user cannot tell whether data is missing, the action is forbidden, or the app is broken
- High-value next steps are blocked without any recovery guidance

#### Fix direction

- Replace silent disabled states with inline rationale
- Add actionable follow-ups where possible:
  - `Add email`
  - `Edit contact`
  - `Primary sign-in provider cannot be disconnected`
- If the action truly must remain disabled, expose the reason in visible helper text, not only tooltip

### 6. Password fields in security settings miss browser autocomplete semantics

- Severity: Low
- URL: `/dashboard/settings?section=security`
- Viewport: reproduced on mobile
- Category: Accessibility as UX, forms & input interference

#### What happens

Browser diagnostics reported missing `autocomplete` attributes for the new password fields, suggesting `new-password`.

#### User harm

- Password managers and browser-assisted secure input get weaker hints
- Mobile entry friction increases on a security-critical form

#### Evidence

- Browser console warning:
  - `Input elements should have autocomplete attributes (suggested: "new-password")`

#### Fix direction

- Add `autocomplete="new-password"` to new password and confirm password fields
- Where relevant, ensure current-password fields use `autocomplete="current-password"`

## Strengths Observed

- Core dashboard shell remained stable across desktop, tablet, and mobile
- No first-party console errors surfaced during the main dashboard, inbox, contacts, and settings audit
- Same-origin API traffic and authenticated transitions behaved reliably in the audited flows
- Mobile shell navigation via hamburger menu was functional and discoverable

## Priority Order

1. Fix mobile security card overflow for TOTP setup
2. Replace generic admin-route failure states with role-aware access/error handling
3. Rework mobile inbox toolbar density
4. Clean up localization gaps in authenticated settings and dashboard copy
5. Remove unexplained disabled actions in contacts and security
6. Add password autocomplete semantics

## Recommended Next Pass

- Audit calendar, AI assistant, onboarding, and invitation acceptance flows with the same breakpoint set
- Run a dedicated keyboard-only and focus-order pass
- Convert the highest-severity findings into regression tests:
  - mobile TOTP CTA visibility
  - admin route role-state rendering
  - mobile inbox toolbar layout

## Post-Deploy Verification

- Re-tested after production deploy on `https://mail-agent-indol.vercel.app`
- Verified fixed:
  - mobile security CTA no longer clips on `/dashboard/settings?section=security`
  - admin routes now show an explicit access-limited state instead of a generic failure
  - mobile inbox header gives search the primary row and no longer squeezes the count label into the same line
  - password toggle labels are localized
  - connected-account disabled unlink state now explains why it is blocked
- Residual low-priority signal:
  - browser diagnostics still suggest an optional hidden username field for password-form autofill heuristics on the security page

## Regression Verification 2

- Production backend redeployed again on March 12, 2026 after attachment streaming and super-admin permission fixes
- Verified fixed in live production:
  - `POST /api/v1/contacts/lookup-by-emails` now returns `200` during the real inbox page load for `super-admin`
  - `GET /api/v1/emails/:emailId/attachments/:attachmentId/download` now returns `200` and streams the file through the backend without the previous R2 CORS failure
- Authenticated route sweep completed successfully with `200` document responses and no first-party `4xx/5xx` requests during page load for:
  - `/dashboard`
  - `/dashboard/email`
  - `/dashboard/calendar`
  - `/dashboard/contacts`
  - `/dashboard/ai`
  - `/dashboard/ai/follow-ups`
  - `/dashboard/settings`
  - `/dashboard/settings?section=security`
  - `/dashboard/admin/users`
  - `/dashboard/admin/organizations`
- Residual low-priority browser warnings:
  - a chart container warning on `/dashboard/admin/organizations` reports width and height resolving to `-1`
  - browser diagnostics still suggest improved password-form autofill semantics on the security page

## Mobile Deep Pass

- Date: March 12, 2026
- Environment: production `https://mail-agent-indol.vercel.app`
- Viewport: mobile phone (`412x915`, Pixel 7 class)
- Auth path: real sign-in flow, legal-acceptance step completed in the same session

### Finding 1: Dashboard Home leaks AI consent errors into the primary mobile surface

- URL: `/dashboard`
- Severity: High
- Category: State gating, mobile trust, consent-aware UX

#### What happens

- The mobile dashboard renders the `Briefing Giornaliero` card in an error state.
- The page fires `GET /api/v1/ai/briefing` twice and receives `403 FORBIDDEN` both times.
- In the same authenticated session, all AI consent flags were `false`, so the widget is attempting to load AI-only data even when the user has not granted the required consent.

#### User harm

- The first mobile surface looks broken immediately after login.
- Users see a technical error where the product should either hide the widget or explain that AI features are disabled until consent is granted.

#### Evidence

- API failures:
  - `GET /api/v1/ai/briefing` -> `403`
  - repeated twice during the same mobile dashboard load
- UI text on the live page:
  - `Request failed with status code 403`

#### Likely owner

- `frontend/hooks/queries/use-dashboard.ts`
- `frontend/components/dashboard/widgets/BriefingWidget.tsx`
- `frontend/components/dashboard/widgets/PredictiveInsightsWidget.tsx`

#### Fix direction

- Gate `useBriefing()` behind the relevant consent state instead of firing unconditionally.
- Replace the technical error state with a consent-aware empty state such as “Enable AI features in onboarding/settings to use briefing.”

### Finding 2: Mobile admin users table is wider than the viewport and clips actionable columns

- URL: `/dashboard/admin/users`
- Severity: High
- Category: Responsive layout, admin usability

#### What happens

- The admin users page renders a desktop table on mobile without a mobile presentation mode.
- The visible viewport width was `412px`, while the measured first rows extended to roughly `901px`.
- The right-hand columns and action controls are cut off rather than reflowed into a card/list pattern.

#### User harm

- Roles, status, verification, created date, and actions are not fully visible on phone width.
- Critical admin actions become hard or impossible to review confidently on mobile.

#### Evidence

- Measured mobile viewport: `412px`
- Measured row width:
  - last visible action cell ended near `901px`
- Visual symptom:
  - role chips visibly clip on the right edge in the mobile screenshot

#### Likely owner

- `frontend/components/admin/UserListTable.tsx`

#### Fix direction

- Replace the table with stacked user cards below a mobile breakpoint.
- If a table must remain, add explicit horizontal scroll affordance instead of clipping hidden columns.

### Finding 3: Profile page still mixes English and Italian on mobile

- URL: `/dashboard/profile`
- Severity: Medium
- Category: Localization consistency

#### What happens

- The page header is still `User Profile` while the form section beneath it is localized as `Impostazioni profilo`.

#### User harm

- The page feels partially translated and less polished, especially on mobile where the header is the first thing users read.

#### Evidence

- Live mobile page header:
  - `User Profile`
- Form section:
  - `Impostazioni profilo`

#### Likely owner

- `frontend/pages/dashboard/profile.tsx`

#### Fix direction

- Replace the hard-coded English header with translated copy from the locale bundle.

### Mobile Pass Coverage

- Re-tested on mobile:
  - `/dashboard`
  - `/dashboard/email`
  - `/dashboard/email/compose`
  - `/dashboard/calendar`
  - `/dashboard/contacts`
  - `/dashboard/ai`
  - `/dashboard/ai/follow-ups`
  - `/dashboard/profile`
  - `/dashboard/settings`
  - `/dashboard/settings?section=security`
  - `/dashboard/admin/users`
  - `/dashboard/admin/organizations`
- Additional interaction spot checks:
  - sign-in on mobile
  - legal acceptance redirect and completion
  - email-thread availability check from inbox

### Mobile Pass Summary

- Stable on mobile:
  - inbox route shell and compose screen
  - calendar shell
  - contacts empty state
  - AI assistant shell
  - follow-up board shell
  - settings general and security layout
  - admin organizations page shell
- Open mobile issues after this pass:
  1. dashboard AI briefing is not consent-gated
  2. admin users page is not truly responsive
  3. profile page still has localization drift

### 2026-03-12 Follow-up: Labels 403 Retest

- Symptom reported:
  - repeated `GET /api/v1/labels` `403` in the mobile email shell
- Root cause:
  - could not reproduce as a live backend permission failure
  - production `/api/v1/labels` now returns `200` with the authenticated mobile session
  - the frontend query client was still retrying `401` and `403`, which amplified transient auth-state misses into repeated console noise
- Fix shipped:
  - shared TanStack Query defaults now use the same `shouldRetryQuery()` policy already applied in billing/settings hooks
  - default queries no longer retry `401`, `403`, or `429`
- Post-deploy verification:
  - `/dashboard/email` on mobile
  - `GET /api/v1/labels` -> `200`
  - no console errors during the focused retest

### 2026-03-12 Follow-up: Dashboard Consent Gate + Profile Localization

- Fix shipped:
  - the dashboard briefing widget now waits for `ai_email_processing` consent before querying `/api/v1/ai/briefing`
  - the AI daily briefing component follows the same consent gate
  - the profile page title now uses localized settings copy instead of a hard-coded English heading
- Post-deploy verification:
  - `/dashboard` on mobile
  - no `GET /api/v1/ai/briefing` request when AI email processing consent is disabled
- no console errors during the focused retest
- consent explanation is shown instead of a raw error state
- `/dashboard/profile` header renders `Impostazioni profilo`

## 2026-03-13 Deep Mobile Email Audit

- Audit mode:
  - authenticated Edge session
  - mobile viewport (`375x812`)
  - production app: `https://mail-agent-indol.vercel.app`
- Scope:
  - inbox list
  - thread view
  - reply
  - forward
  - compose AI panel
  - important/flag actions
  - draft autosave
  - draft reopen flow

### Finding 1: Reply and forward routes open a blank composer instead of a populated reply/forward draft

- URL:
  - source thread: `/dashboard/email/thread/cmmp0vuwu08jl01p9xhs8r9u6`
  - reply route: `/dashboard/email/compose?replyTo=cmmp0vuwu08jl01p9xhs8r9u6&threadId=cmmp0vuwu08jl01p9xhs8r9u6`
  - forward route: `/dashboard/email/compose?forward=cmmp0vuwu08jl01p9xhs8r9u6`
- Severity: Critical
- Category: Core email action failure

#### What happens

- Tapping `Rispondi` opens the compose dialog, but the composer is blank:
  - no recipient in `A:`
  - empty subject
  - empty editor body
- Tapping `Inoltra` does the same:
  - the composer opens, but it behaves like a new message rather than a forward

#### User harm

- Reply and forward are among the highest-frequency email actions.
- On mobile, both paths silently discard the original message context and force the user to rebuild the action manually.
- Because the dialog still opens, the failure looks like a user mistake instead of a product bug.

#### Evidence

- Reply composer state after tapping `Rispondi`:
  - subject value: `""`
  - `A:` value: `""`
  - editor body: empty placeholder paragraph
- Forward composer state after tapping `Inoltra`:
  - subject value: `""`
  - editor body: empty placeholder paragraph

#### Likely owner

- `frontend/pages/dashboard/email/thread/[threadId].tsx`
- `frontend/pages/dashboard/email/compose.tsx`
- `frontend/components/email/compose/ComposeDialog.tsx`

#### Fix direction

- Normalize thread action routing so reply/reply-all/forward pass the parameters that the compose page actually reads.
- Prefer a single contract such as `?mode=reply&emailId=...`, `?mode=replyAll&emailId=...`, and `?mode=forward&emailId=...`.
- Add a mobile E2E regression that asserts recipients, subject prefix, and quoted body are prefilled.

### Finding 2: Draft autosave partially succeeds, then fails with repeated validation errors

- URL: `/dashboard/email/compose`
- Severity: High
- Category: Data integrity, error handling

#### What happens

- Creating a new draft on mobile produced one successful autosave, then two failing autosave attempts immediately after.
- The UI surfaced `Impossibile salvare la bozza.` even though the draft had already been created successfully.

#### User harm

- Users cannot trust whether their draft is safe.
- The mixed `saved now` plus `failed to save draft` signals create uncertainty about whether to continue writing.
- Repeated invalid autosaves are noisy and likely waste backend capacity.

#### Evidence

- Network:
  - `POST /api/v1/emails/drafts` -> `201`
  - `POST /api/v1/emails/drafts` -> `400`
  - `POST /api/v1/emails/drafts` -> `400`
- Console:
  - `VALIDATION_ERROR` request IDs:
    - `Z1x70T_x5KCztDA2trumN`
    - `ncbP34YGXJUoIAFy0dLIN`
- UI text:
  - `Impossibile salvare la bozza.`

#### Likely owner

- `frontend/components/email/compose/ComposeDialog.tsx`
- `frontend/lib/api/emails.ts`

#### Fix direction

- Trace the autosave payload difference between the initial create and subsequent saves.
- Prevent follow-up autosaves from sending an invalid create payload after `draftId` is assigned.
- Replace contradictory save toasts with a single clear draft status model.

### Finding 3: Opening a draft on mobile goes to read-only thread view instead of reopening the editor

- URL:
  - draft list: `/dashboard/email` with account folder `Bozze`
  - opened draft route: `/dashboard/email/thread/cmmp9885n003701mxl0pyuzph`
- Severity: Critical
- Category: Core draft workflow failure

#### What happens

- A saved draft appears in `Bozze` correctly.
- Tapping the draft does not reopen the compose editor.
- Instead, it routes to the thread reader and shows reply/forward/delete actions with no editable composer.

#### User harm

- Mobile users cannot reliably continue writing a saved draft.
- Drafts become effectively dead-end message records rather than editable work-in-progress items.

#### Evidence

- Draft list item visible with subject:
  - `MOBILE AUDIT DRAFT 2026-03-13 01:00`
- Open behavior:
  - route changed to `/dashboard/email/thread/cmmp9885n003701mxl0pyuzph`
  - viewport screenshot shows read-only thread header and action bar, not the editor

#### Likely owner

- `frontend/pages/dashboard/email.tsx`
- `frontend/pages/dashboard/email/compose.tsx`
- `frontend/components/email/list/*`

#### Fix direction

- Distinguish draft rows from normal message rows in the mobile list click handler.
- Draft rows should navigate to compose with `draftId=...`, not to thread view.
- Add a mobile test that saves a draft, opens it from `Bozze`, and asserts the editor is restored.

### Finding 4: Important/flag action succeeds, but the mobile action menu does not reflect the new state

- URL: `/dashboard/email/thread/cmmp0vuwu08jl01p9xhs8r9u6`
- Severity: Medium
- Category: State feedback, mobile email controls

#### What happens

- The conversation actions menu exposes both:
  - `Contrassegna tutti i messaggi`
  - `Rimuovi contrassegno da tutti`
- After tapping `Contrassegna tutti i messaggi`, the backend mutation succeeds and the success toast is shown.
- Reopening the same menu still shows both actions simultaneously, so the UI never resolves to a single truthful state.

#### User harm

- Users cannot tell whether the conversation is currently marked important.
- The action model feels nondeterministic, especially on mobile where the menu is the only available control surface.

#### Evidence

- Network:
  - `PATCH /api/v1/emails/bulk/flag` -> `200`
- Success toast:
  - `Tutti i messaggi contrassegnati`
- Post-mutation menu still shows:
  - `Contrassegna tutti i messaggi`
  - `Rimuovi contrassegno da tutti`

#### Likely owner

- `frontend/components/email/thread/ThreadHeader.tsx`
- `frontend/components/email/thread/ThreadView.tsx`
- `frontend/lib/api/emails.ts`

#### Fix direction

- Resolve the menu from the current thread flag state instead of rendering both actions unconditionally.
- After mutation success, refetch or optimistically update the thread state before reopening the menu.

### Finding 5: Mobile thread content still leaves a large blank gutter on the left

- URL: `/dashboard/email/thread/cmmp0vuwu08jl01p9xhs8r9u6`
- Severity: High
- Category: Responsive rendering

#### What happens

- The email body is shifted right on mobile, leaving visible dead space on the left side of the viewport.
- The content looks truncated or squeezed even when the underlying HTML itself fits.

#### User harm

- Message reading feels broken on phone width.
- Users lose horizontal space exactly where readability is most constrained.

#### Evidence

- Measured viewport width: `375px`
- Measured body wrapper:
  - width: about `358px`
  - computed `padding-left`: `60px`
  - computed `padding-right`: `16px`
- Measured email table:
  - `left: 61`
  - `width: 282`
  - `right: 343`

#### Likely owner

- `frontend/components/email/thread/EmailHtmlContent.tsx`

#### Fix direction

- Remove the asymmetric left padding/centering behavior below the mobile breakpoint.
- Normalize legacy email HTML into a full-width mobile container before applying table shrinking rules.

### Finding 6: AI compose on mobile traps the user behind a backdrop and blocks adjacent controls

- URL: `/dashboard/email/compose`
- Severity: Medium
- Category: Mobile overlay behavior

#### What happens

- Opening `Composizione AI` shows the AI panel correctly, but the backdrop intercepts pointer events behind it.
- While the panel is open, nearby composer controls such as the dialog close button cannot be tapped.

#### User harm

- The panel feels stuck or overlaid incorrectly.
- On mobile, where screen real estate is limited, a blocking backdrop without a clean single-stack interaction model creates friction immediately.

#### Evidence

- Playwright interaction failure while AI compose was open:
  - `MuiBackdrop-root ... intercepts pointer events`
- The issue reproduced both on the composer close button and on the thread close path while a menu/backdrop overlay was active.

#### Likely owner

- `frontend/components/email/compose/ComposeDialog.tsx`
- `frontend/components/email/compose/EditorMenuControls.tsx`

#### Fix direction

- Make the mobile AI compose experience a clear sheet/drawer with an explicit top-level dismiss pattern.
- Prevent invisible backdrops from intercepting taps on controls that appear visually reachable.

### Deep Mobile Email Summary

- Confirmed broken on mobile:
  1. reply opens a blank new-message composer
  2. forward opens a blank new-message composer
  3. draft autosave produces contradictory success/failure states
  4. tapping a saved draft opens thread view instead of the editor
  5. important/flag menu state is inconsistent after successful mutation
  6. thread body still wastes horizontal space with a visible left gutter
  7. AI compose/backdrop behavior blocks nearby controls
- Confirmed healthy in this pass:
  - `GET /api/v1/labels` -> `200`
  - `POST /api/v1/contacts/lookup-by-emails` -> `200`
  - temporary audit draft was deleted after testing

## 2026-03-13 Mobile Email Remediation Verification

The following mobile email regressions were fixed and redeployed to `https://mail-agent-indol.vercel.app`.

### Fixed

- Reply now routes to `/dashboard/email/compose?mode=reply&emailId=...` and opens with:
  - prefilled `Re:` subject
  - original sender in recipients
  - quoted thread content visible
- Forward now routes to `/dashboard/email/compose?mode=forward&emailId=...` and opens with:
  - prefilled `Fwd:` subject
  - forwarded content visible
- Draft autosave now updates with `id` instead of the invalid legacy `existingDraftId` field.
- Tapping a draft from the mobile email list now routes to `/dashboard/email/compose?draftId=...` instead of thread view.
- Draft subject and body both restore correctly inside the editor when reopening a draft.
- The thread important menu now renders a single truthful action:
  - before flagging: `Contrassegna tutti i messaggi`
  - after flagging: `Rimuovi contrassegno da tutti`
- The thread content gutter was removed on phone width:
  - measured body host left edge is now about `19px`
  - parent left padding is now `16px`
- AI compose popovers no longer block adjacent composer controls via modal pointer interception.

### Production Verification Notes

- Validation ran against the deployed production frontend after the Vercel redeploy on March 13, 2026.
- The authenticated mobile storage state used for verification had an empty live inbox, so reply/forward/thread-state checks were executed against mocked email/thread API responses on the deployed frontend shell.
- Draft autosave/open and compose overlay behavior were verified on the deployed mobile composer itself.

### Verification Results

- Reply verification:
  - URL: `/dashboard/email/compose?mode=reply&emailId=mock-email-1`
  - subject: `Re: Mock Mobile Thread`
  - quoted content visible: yes
  - recipient restored: yes
- Forward verification:
  - URL: `/dashboard/email/compose?mode=forward&emailId=mock-email-1`
  - subject: `Fwd: Mock Mobile Thread`
  - forwarded content visible: yes
- Draft autosave verification:
  - autosave requests observed: `2`
  - legacy `existingDraftId` present: no
  - update request uses `id`: yes
- Draft reopen verification:
  - URL: `/dashboard/email/compose?draftId=mock-draft-created`
  - subject restored: yes
  - body restored: yes
- Important menu verification:
  - initial menu shows only `Contrassegna tutti i messaggi`
  - post-flag menu shows only `Rimuovi contrassegno da tutti`
- AI compose verification:
  - AI popover opens
  - tapping the subject field while the AI popover is open no longer throws a pointer interception error

## 2026-03-13 Continued Mobile Product Audit

### Scope

- Target app: `https://mail-agent-indol.vercel.app`
- Audit mode: authenticated mobile sweep on production
- Viewport: `412x915`
- Method:
  - route-by-route mobile pass
  - console and network inspection
  - DOM width checks for clipped or trapped overflow
  - UX review against mobile-first and responsive interaction standards

### Routes Checked

- `/dashboard`
- `/dashboard/email`
- `/dashboard/email/compose`
- `/dashboard/calendar`
- `/dashboard/contacts`
- `/dashboard/ai`
- `/dashboard/ai/follow-ups`
- `/dashboard/profile`
- `/dashboard/settings`
- `/dashboard/settings?section=security`
- `/dashboard/admin/users`
- `/dashboard/admin/organizations`
- `/dashboard/tasks`
- `/dashboard/analytics`

### Finding 1: Mobile analytics is production-broken and fails with a consent-gated 403

- Severity: High
- URL: `/dashboard/analytics`
- Category: Error handling, permission-state UX, localization

#### What happens

- The page loads a minimal shell and then fails its primary chart request.
- Production returns `GET /api/v1/ai/analytics/email -> 403 FORBIDDEN`.
- The widget logs `Failed to fetch analytics data`.
- The page title remains `Analytics` in English inside the Italian dashboard.

#### User harm

- The page's primary purpose fails on first load.
- The UI does not explain whether the issue is missing consent, missing permissions, or missing data.
- Users receive a broken analytics page instead of a recoverable consent-gated state.

#### Evidence

- Request failure observed in production:
  - `GET /api/v1/ai/analytics/email -> 403`
  - requestId: `RAJwDaunaBn_kbx0dGtyo`
- Console warning also reproduced:
  - `The width(-1) and height(-1) of chart should be greater than 0`

#### Likely owners

- `backend/src/modules/ai/controllers/ai.controller.ts`
- `frontend/components/dashboard/AnalyticsChart.tsx`
- `frontend/pages/dashboard/analytics.tsx`

#### Code evidence

- Backend route is explicitly consent-gated with `@RequiresConsent('email_analytics')`
- Backend formats weekday labels with `new Intl.DateTimeFormat('en', ...)`
- Frontend chart logs the failure but renders no user-facing recovery state
- Page header is hardcoded as `Analytics`

#### Fix direction

- Replace the raw broken chart state with an explicit mobile-friendly consent/interstitial state.
- If `email_analytics` consent is absent, do not fetch the chart until the UI has presented the required action.
- Localize the page title and backend weekday labels to match the user locale.

### Finding 2: Follow-up board is still a desktop kanban trapped inside mobile overflow

- Severity: High
- URL: `/dashboard/ai/follow-ups`
- Category: Mobile layout, navigation clarity

#### What happens

- The board renders four fixed-width columns on phone width.
- Measured internal content widths were about `1252px` and `1220px` inside a `412px` viewport.
- The board does not trigger page-level overflow because the page and route wrappers hide overflow, so the desktop surface is visually clipped inside its own area.

#### User harm

- A mobile user lands on a compressed desktop board instead of a phone-optimized flow.
- The horizontal interaction model is discoverability-poor because the outer layout suppresses the usual overflow cues.
- Primary follow-up triage becomes a precision-scrolling task on touch.

#### Evidence

- Widest board content measured in production:
  - container width about `1252px`
  - inner input width about `1180px`
- Visible labels on mobile still presented as desktop columns:
  - `In sospeso`
  - `In ritardo`
  - `Risolto`
  - `Scaduto`

#### Likely owners

- `frontend/pages/dashboard/ai/follow-ups.tsx`
- `frontend/components/productivity/KanbanBoard/index.tsx`
- `frontend/components/layout/Layout.tsx`

#### Code evidence

- The board keeps fixed per-column widths on mobile with `minWidth` and `maxWidth` of `260`
- The route wraps the board in `overflow: 'hidden'`
- The shared layout also uses hidden overflow containers

#### Fix direction

- Do not ship the full four-column board as the primary phone layout.
- Use a mobile mode that shows one status lane at a time, or switch to a stacked list with a status filter.
- If horizontal snap-scrolling remains, remove the clipping wrappers and add visible affordances that communicate sideways navigation.

### Finding 3: Admin users remains a clipped desktop table on mobile

- Severity: High
- URL: `/dashboard/admin/users`
- Category: Mobile layout, dense-data usability

#### What happens

- The page renders the full desktop table on phone width.
- Measured table width was about `879px` inside a `412px` viewport.
- Key columns and row actions are hidden off-screen unless the user discovers horizontal scrolling inside the table container.

#### User harm

- The page fails the mobile "see the primary action without precision panning" bar.
- Status, role, and action controls become secondary to table navigation.
- A super-admin can technically access the screen but not use it efficiently on phone.

#### Evidence

- Visible mobile headers still include the full desktop grid:
  - `NOME`
  - `EMAIL`
  - `RUOLO`
  - `STATO`
  - `2FA`
  - `VERIFICATO`
  - `CREATO`
  - `AZIONI`
- No production API failure was needed to reproduce this; the issue is presentation alone.

#### Likely owners

- `frontend/components/admin/UserListTable.tsx`
- `frontend/pages/dashboard/admin/users.tsx`

#### Code evidence

- The search field remains fixed at `width: 300`
- The component renders a standard eight-column `Table`
- The empty state string is still English: `No users found`

#### Fix direction

- Replace the phone layout with user cards or a condensed two-line list item pattern.
- Keep admin actions in an overflow menu per row instead of in visible table columns.
- Localize the empty state and search/table affordances fully.

### Finding 4: Tasks page is still shipping hardcoded English demo content in production

- Severity: Medium
- URL: `/dashboard/tasks`
- Category: Content quality, localization, product trust

#### What happens

- The page shows three pre-seeded tasks in English:
  - `Finalize Q4 marketing budget`
  - `Draft the weekly progress report`
  - `Review design mockups for new homepage`
- Dates are formatted with `toLocaleDateString('en-US', ...)`.

#### User harm

- The page reads as prototype/demoware rather than a live tenant workspace.
- Mixed-language content inside an authenticated Italian product reduces trust quickly.
- Users cannot tell whether the page is real, seeded, or broken.

#### Likely owners

- `frontend/components/dashboard/Tasks.tsx`
- `frontend/pages/dashboard/tasks.tsx`

#### Fix direction

- Remove hardcoded example tasks from production surfaces.
- If task data is not yet live, present a truthful empty state with next actions.
- Localize date formatting and any fallback content.

### Stable In This Pass

- `/dashboard`
- `/dashboard/email`
- `/dashboard/email/compose`
- `/dashboard/calendar`
- `/dashboard/contacts`
- `/dashboard/ai`
- `/dashboard/profile`
- `/dashboard/settings`
- `/dashboard/settings?section=security`
- `/dashboard/admin/organizations`

### Summary

- High-severity mobile issues remain outside the email area.
- The largest current gaps are:
  1. analytics is functionally broken
  2. follow-up board is not genuinely mobile
  3. admin users is not genuinely mobile
  4. tasks still looks like demo content

## 2026-03-13 Mobile Analytics And Follow-up Remediation Verification

The two highest-priority issues from the continued mobile product audit were fixed and redeployed to production.

### Fixed

- `/dashboard/analytics`
  - no longer fires the analytics endpoint when `email_analytics` consent is missing
  - now renders a consent-aware empty state instead of a broken chart
  - page heading is localized as `Analisi`
  - trend labels are now localized from the client locale when analytics data is available
- `/dashboard/ai/follow-ups`
  - now uses a single active status lane on phone width instead of forcing the full desktop kanban
  - no longer produces trapped desktop-width overflow inside the mobile layout
  - keyboard shortcut affordance is hidden on mobile
  - the type filter now actually affects the board contents

### Production Verification

- Deployment target: `https://mail-agent-indol.vercel.app`
- Viewport: `412x915`
- Auth mode: authenticated mobile session

### Verification Results

- `/dashboard/analytics`
  - failed first-party requests: none
  - console errors: none
  - page body showed consent state copy:
    - `Analisi`
    - `Attività Email`
    - `Elabora i metadati delle email per le dashboard analitiche`
    - `Privacy e consenso`
  - document width matched viewport width (`412px`)
- `/dashboard/ai/follow-ups`
  - failed first-party requests: none
  - console errors: none
  - page showed mobile lane selector plus a single active lane
  - document width matched viewport width (`412px`)
  - no oversized elements were detected beyond the viewport

## 2026-03-13 Mobile Chat Drawer Verification

The mobile AI assistant conversation drawer was audited and fixed after a production screenshot showed the drawer content visually overlapping the thread.

### Root Cause

- The mobile conversation drawer used a translucent sidebar background.
- The floating thread menu button had a higher z-index than the drawer itself.
- When the drawer opened, the thread remained visible underneath and the menu trigger still floated above the open panel.

### Fixed

- The mobile conversation list now opens as an opaque side sheet.
- A backdrop is rendered behind the drawer.
- The floating menu trigger is hidden and non-interactive while the drawer is open.
- The drawer panel now sits above the thread with its own elevation and border.

### Production Verification

- URL: `/dashboard/ai`
- Viewport: `375x812`
- Auth mode: authenticated mobile session

### Verification Results

- drawer width measured `320px`
- backdrop opacity was `1` with `pointer-events: auto`
- floating menu trigger opacity was `0` with `pointer-events: none` while open
- drawer panel background rendered as opaque white
- the open drawer no longer visually blends with the thread underneath

## 2026-03-13 Mobile Thread Header Date Fix

The expanded mobile email message header was updated so the timestamp no longer competes horizontally with sender and recipient metadata.

### Fixed

- the right-side metadata/actions area in expanded thread messages now drops to its own row on phone widths
- sender, recipient, and CC lines can wrap safely instead of being compressed by the timestamp
- the collapse control remains reachable without forcing the date into the sender line

### Implementation

- `frontend/components/email/thread/ExpandedMessage.tsx`

### Verification

- `npm run type-check` passed
- `npm run build` passed
- Vercel production deploy completed to `https://mail-agent-indol.vercel.app`
- limitation: the stored authenticated mobile test session had an empty inbox, so this specific fix was verified through the responsive layout change and clean production build rather than by reopening a live production thread from that test state

## 2026-03-13 Calendar Functionality Audit

The production calendar was audited with a real authenticated Edge profile on both desktop and mobile against `https://mail-agent-indol.vercel.app`.

### Root Causes Found

- event creation from `Nuovo evento` was broken because the form stored an invalid placeholder calendar value and then paired it with the first provider on submit
- event edit mode populated `datetime-local` inputs with UTC ISO strings, so saving an unchanged event could silently shift it by one hour
- event deletion was immediate from the detail dialog with no confirmation, which is a poor destructive-action pattern for a scheduling surface

### Fixed

- calendar creation now stores a provider-qualified calendar selection and submits the matching `providerId`, `calendarId`, and `calendarName`
- calendar forms now default to the first real available calendar instead of legacy placeholder values
- quick-event and edit flows now use local `datetime-local` formatting instead of UTC ISO slicing
- event deletion now requires explicit confirmation before the `DELETE` request is sent

### Implementation

- `frontend/components/dashboard/calendar/calendar-event-form.ts`
- `frontend/components/dashboard/calendar/calendar-date-time.ts`
- `frontend/components/dashboard/calendar/useCalendarHandlers.ts`
- `frontend/components/dashboard/Calendar.tsx`
- `frontend/components/calendar/CalendarEventDialog.tsx`
- `frontend/components/calendar/CalendarEventDetail.tsx`

### Automated Validation

- `npm run test -- components/dashboard/calendar/calendar-event-form.test.ts components/dashboard/calendar/calendar-date-time.test.ts`
- `npm run type-check`
- `npm run build`
- Vercel production deploy completed to `https://mail-agent-indol.vercel.app`

### Production Verification

- auth mode: local authenticated Edge profile
- desktop viewport: `1440x900`
- mobile viewport: `390x664`

### Verification Results

- desktop `Nuovo evento` create flow
  - `POST /api/v1/calendar/events` returned `201`
  - created event rendered immediately in month view
- desktop event edit flow
  - `PATCH /api/v1/calendar/events/:id` returned `200`
  - event title, location, and description persisted
  - event time remained stable at `11:00 - 12:00` after save
- desktop delete flow
  - confirmation dialog appeared before deletion
  - `DELETE /api/v1/calendar/events/:id` returned `204` only after explicit confirm
- desktop refresh flow
  - sync trigger returned `POST /api/v1/calendar/sync/:providerId` with no failed first-party requests
- desktop quick-event flow
  - pressing Enter in the quick-event input opened the create dialog with the real calendar preselected
- mobile create flow from calendar sidebar drawer
  - drawer closed before the event dialog opened
  - dialog fit within viewport width (`326px` inside `390px`)
  - `POST /api/v1/calendar/events` returned `201`
- mobile event open/delete flow
  - created event opened from list view without console or network failures
  - delete completed cleanly and removed the event from the view

### Residual Risk

- I did not validate drag-and-drop move/resize on touch hardware because the mobile audit used a desktop automation environment emulating phone viewport, not a physical touchscreen

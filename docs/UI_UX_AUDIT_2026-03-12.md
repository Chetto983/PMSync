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

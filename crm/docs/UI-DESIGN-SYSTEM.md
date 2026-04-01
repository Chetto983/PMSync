# CRM UI/UX Design System

Established visual patterns from validated production screenshots. Follow these EXACTLY for consistency across all CRM pages.

## Layout Structure
- **Max width:** 1200px with responsive padding `p: { xs: 2, md: 3 }`
- **Breadcrumb:** `Dashboard / CRM / {Module} / {Entity Name}` — uses `MuiLink` + `NextLink` for clickable segments, last segment is plain `Typography`
- **Header:** Back arrow (`ArrowLeft`) + entity icon (e.g. `Building2`) + inline-editable entity name
- **Tab bar:** Horizontal `Tabs` with bottom border (`borderBottom: 1, borderColor: 'divider'`)
- **Content area:** `Paper variant="outlined"` with `p: 2` inside tab panels

## Inline Editing Pattern
- **Display mode:** Text with pencil icon (`Pencil size={14}`, opacity 0.4), clickable area with `hover: bgcolor: 'action.hover'`, rounded corners
- **Edit mode:** `TextField size="small" fullWidth autoFocus` with check/X icon buttons (`Check size={16}`, `X size={16}`)
- **Keyboard:** Enter saves (single-line), Escape cancels
- **Multiline:** Uses `multiline rows={3}`, Enter does NOT save (allows newlines)
- **No label clutter:** Field type shown via `Tooltip` on hover, not permanent label

## Form Fields (Selects & Inputs)
- **Enum selects:** `TextField select size="small" fullWidth` with `MenuItem` options — includes empty `—` option to clear
- **Number inputs:** `TextField type="number" size="small"` with `slotProps={{ htmlInput: { min: 0, step: 0.01 } }}`
- **Field labels:** From translations (`ta?.form?.fieldName ?? 'Fallback'`)
- **Layout:** `Grid container spacing={2}` with responsive columns (`xs: 12, sm: 4` for 3-column, `xs: 12, md: 6` for 2-column)
- **Section divider:** `Divider sx={{ my: 0.5 }}` between info groups

## Address Editing (Compound Field)
- **Display:** Single-line comma-joined string, click-to-edit with pencil icon
- **Edit:** Expands to multi-field form: Street (full width), City + State (row), ZIP + Country (row)
- **Buttons:** `Button size="small" variant="contained"` for Save, plain `Button size="small"` for Cancel
- **Extracted to own component** when parent exceeds 500 lines

## Icon Usage (lucide-react, size consistent)
- **Section icons:** `Globe`, `Phone`, `MapPin` at `size={16}` next to inline fields
- **Entity header:** Entity-specific icon at `size={28}` (e.g. `Building2` for accounts)
- **Navigation:** `ArrowLeft size={20}` in `IconButton size="small"`
- **Edit indicator:** `Pencil size={14}` with `style={{ opacity: 0.4 }}`

## Responsive Behavior (Mobile 375px)
- Grid columns stack to full width (`xs: 12`)
- Selects and inputs go full-width, remain touch-friendly
- Tab bar scrolls horizontally if needed
- Breadcrumb wraps naturally
- Sidebar collapses to hamburger menu

## List Pages
- **Header:** Title + subtitle + primary action button (e.g. `+ Nuovo Account`)
- **Search:** Full-width `TextField` with search icon above table
- **Table:** MUI `Table` with column headers (NOME, SITO WEB, SETTORE, DIMENSIONE)
- **Industry column:** Displayed as `Chip variant="outlined"` in list view (NOT in detail view)
- **Pagination:** Localized (`Righe per pagina`, `1-1 di 1`) via `TablePagination` with `labelRowsPerPage` and `labelDisplayedRows`
- **Empty state:** Centered message with action button

## Tab Content Patterns
- **Data tab (Info, Contacts):** Immediate content render with loading skeleton
- **Placeholder tabs (Deals, Activity):** Centered `Typography color="text.secondary"` with "Coming in Sprint XX" message
- **Contacts tab:** List with role chips, add button opens dialog with Autocomplete search

## Color & Theming
- **NO hardcoded colors.** Use MUI theme tokens only (`text.primary`, `text.secondary`, `text.disabled`, `action.hover`, `divider`)
- **Chips in lists:** `variant="outlined"` with default color
- **Links:** MUI `Link` with `underline="hover"` and `color="text.secondary"`

## Anti-Patterns
- Do NOT use `Chip` for editable fields in detail views (Chips are for read-only list columns only)
- Do NOT add permanent labels on inline-edit fields (use Tooltip instead)
- Do NOT omit the empty `—` option on select fields (user must be able to clear)

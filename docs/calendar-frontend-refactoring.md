# Calendar Frontend Refactoring & Bug Fix Plan

## Overview

This document outlines the comprehensive refactoring plan for the frontend Calendar module to address bugs, improve maintainability, and align with project standards defined in `CLAUDE.md`.

## Current Issues

### 1. Color Picker Bug (HIGH PRIORITY)

**Location:** [Calendar.tsx:1229-1252](frontend/components/dashboard/Calendar.tsx#L1229-L1252)

**Problem:**
- Color picker uses only 10 hardcoded preset colors (`CALENDAR_COLORS` at line 90-93)
- No ability to select custom colors
- Colors don't respect MUI theme
- User cannot input custom hex values

**Current Implementation:**
```typescript
// Line 90-93 - Hardcoded colors
const CALENDAR_COLORS = [
  '#0B7EFF', '#9C27B0', '#00C853', '#FF9800', '#E91E63',
  '#3F51B5', '#009688', '#795548', '#607D8B', '#FF5722',
];

// Line 1235-1250 - Simple preset circles
<Popover ...>
  <Box sx={{ p: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 160 }}>
    {CALENDAR_COLORS.map((color) => (
      <Box
        key={color}
        onClick={() => handleColorSelect(color)}
        sx={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: color,
          cursor: 'pointer',
        }}
      />
    ))}
  </Box>
</Popover>
```

**Solution:**
1. Create `CalendarColorPicker` component with:
   - Native HTML5 `<input type="color">` for full color selection
   - Preset color palette for quick selection
   - Hex input field for precise control
   - MUI theme integration

---

### 2. File Size Violation (HIGH PRIORITY)

**Location:** [Calendar.tsx](frontend/components/dashboard/Calendar.tsx) - 1,703 lines

**Problem:**
- Violates CLAUDE.md rule: "Files under 500 lines"
- Single component doing too many things
- Hard to maintain and test

**Current Structure:**
```
Calendar.tsx (1,703 lines)
├── Interfaces (70-96)
├── Constants (89-96)
├── Main Component (98-1703)
│   ├── State declarations (~30 useState calls)
│   ├── Helper functions (loadEnabledState, saveEnabledState, etc.)
│   ├── API handlers (updateCalendarColor, loadCalendars, loadEvents, etc.)
│   ├── Event handlers (handleDateSelect, handleEventClick, etc.)
│   ├── WebSocket effects
│   ├── Render functions (renderSidebarContent, renderEventDialog, etc.)
│   └── Main JSX
```

**Solution - Extract Components:**

| Component | Lines | Location |
|-----------|-------|----------|
| `CalendarSidebar.tsx` | ~200 | Sidebar with calendar list, quick event |
| `CalendarColorPicker.tsx` | ~80 | Color picker popover |
| `CalendarEventDialog.tsx` | ~250 | Create/Edit event dialog |
| `CalendarEventDetail.tsx` | ~150 | Event detail view dialog |
| `CalendarHeader.tsx` | ~100 | Navigation, view toggle |
| `CalendarGrid.tsx` | ~100 | FullCalendar wrapper |
| `useCalendarState.ts` | ~150 | Custom hook for state management |
| `useCalendarWebSocket.ts` | ~80 | WebSocket subscription logic |

---

### 3. Direct API Calls Instead of TanStack Query (MEDIUM PRIORITY)

**Locations:**
- `Calendar.tsx:255` - `calendarApi.updateCalendarPreferences()`
- `Calendar.tsx:295` - `calendarApi.listCalendars()`
- `Calendar.tsx:359` - `calendarApi.listEvents()`
- `Calendar.tsx:379` - `calendarApi.syncProvider()`
- `Calendar.tsx:420` - `calendarApi.createEvent()`
- `Calendar.tsx:488` - `calendarApi.updateEvent()`
- `Calendar.tsx:512` - `calendarApi.deleteEvent()`

**Problem:**
- No automatic caching
- No background refetching
- No optimistic updates
- Manual loading state management

**Solution:**
Use the TanStack Query hooks created in Phase 1:
- `useCalendars()` - for loading calendar list
- `useCalendarEvents()` - for loading events
- `useCreateCalendarEvent()` - for creating events
- `useUpdateCalendarEvent()` - for updating events
- `useDeleteCalendarEvent()` - for deleting events
- `useSyncCalendarProvider()` - for syncing
- `useUpdateCalendarPreferences()` - for color updates

---

### 4. Hardcoded Strings (MEDIUM PRIORITY)

**Locations:**
- Line 279: `'Color updated'` fallback
- Line 286: `'Failed to update color'` fallback
- Line 1070: `'My Calendars'` fallback

**Solution:**
Ensure all translations exist in `locales/en.ts` and `locales/it.ts` and remove fallbacks.

---

### 5. Missing Theme Colors (LOW PRIORITY)

**Problem:**
- Hardcoded hex colors like `#0B7EFF`, `#9C27B0`, etc.
- Should use MUI theme palette or theme-aware colors

**Solution:**
- Use `theme.palette.primary.main`, `theme.palette.secondary.main` etc.
- Or provide theme-compatible preset palettes

---

## Implementation Order

### Phase 1: Bug Fix - Color Picker (Immediate)

1. Create `CalendarColorPicker.tsx` component
2. Add translations for color picker
3. Update `Calendar.tsx` to use new component
4. Validate with Playwright

### Phase 2: Component Extraction (Next Sprint)

1. Extract `CalendarColorPicker.tsx` (done in Phase 1)
2. Extract `CalendarSidebar.tsx`
3. Extract `CalendarEventDialog.tsx`
4. Extract `CalendarEventDetail.tsx`
5. Extract `CalendarHeader.tsx`
6. Create `useCalendarState.ts` hook

### Phase 3: TanStack Query Migration (Following Sprint)

1. Replace direct API calls with hooks
2. Add optimistic updates
3. Implement proper cache invalidation

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `components/calendar/CalendarColorPicker.tsx` | Full-featured color picker |
| `components/calendar/CalendarSidebar.tsx` | Sidebar with calendar list |
| `components/calendar/CalendarEventDialog.tsx` | Event create/edit dialog |
| `components/calendar/CalendarEventDetail.tsx` | Event detail view |
| `components/calendar/CalendarHeader.tsx` | Calendar header with navigation |
| `hooks/use-calendar-state.ts` | Calendar state management hook |

### Modifications

| File | Changes |
|------|---------|
| `locales/en.ts` | Add color picker translations |
| `locales/it.ts` | Add color picker translations |
| `Calendar.tsx` | Use extracted components, TanStack Query hooks |

---

## Color Picker Component Specification

### CalendarColorPicker Props

```typescript
interface CalendarColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}
```

### Features

1. **Preset Colors** - Quick selection grid (theme-compatible)
2. **Custom Color** - Native HTML5 color input
3. **Hex Input** - Text field for precise hex values
4. **Live Preview** - Shows selected color
5. **Theme Integration** - Uses MUI palette for presets

### UI Layout

```
┌──────────────────────────────────┐
│  Choose Color                    │
├──────────────────────────────────┤
│  [●][●][●][●][●][●]             │  <- Preset palette
│  [●][●][●][●][●][●]             │
├──────────────────────────────────┤
│  Custom:                         │
│  [████████]  #3B82F6             │  <- Color picker + hex input
└──────────────────────────────────┘
```

---

## Validation Checklist

- [ ] Color picker allows custom color selection
- [ ] Selected color is saved via API
- [ ] Calendar events display with new color
- [ ] Mobile responsive design works
- [ ] TypeScript compilation passes
- [ ] All translations are present
- [ ] Theme colors are respected

---

## Technical Notes

### HTML5 Color Input

```html
<input type="color" value="#3B82F6" />
```

- No additional packages required
- Works across all modern browsers
- Returns hex color value

### MUI Integration

```typescript
// Wrap native input with MUI styling
<Box component="input"
  type="color"
  value={color}
  onChange={(e) => onColorChange(e.target.value)}
  sx={{
    width: 40,
    height: 40,
    border: 'none',
    borderRadius: 1,
    cursor: 'pointer',
    '&::-webkit-color-swatch-wrapper': { padding: 0 },
    '&::-webkit-color-swatch': { borderRadius: 4, border: 'none' },
  }}
/>
```

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Color Picker Component | 1 hour |
| Translations | 15 min |
| Calendar.tsx Updates | 30 min |
| Playwright Validation | 30 min |
| Component Extraction (Phase 2) | 4 hours |
| TanStack Query Migration (Phase 3) | 3 hours |

---

## References

- [CLAUDE.md Frontend Rules](../CLAUDE.md#frontend-development-procedure)
- [TanStack Query Best Practices](https://tanstack.com/query/latest/docs/framework/react/guides/queries)
- [MUI Theming](https://mui.com/material-ui/customization/theming/)
- [HTML5 Color Input](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/color)

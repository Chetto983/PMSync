/**
 * Calendar components exports
 *
 * Modular architecture following 2025 best practices:
 * - Extracted sidebar, header, dialogs
 * - Max ~300 lines per file
 * - Type exports for consumers
 */

// Core components
export { CalendarColorPicker } from './CalendarColorPicker';
export { CalendarSidebar } from './CalendarSidebar';
export { CalendarEventDialog } from './CalendarEventDialog';
export { CalendarEventDetail } from './CalendarEventDetail';
export { CalendarHeader } from './CalendarHeader';

// Types
export type { CalendarPreference, ProviderGroup } from './CalendarSidebar';
export type { NewEventData, EventFormErrors } from './CalendarEventDialog';
export type { EditedEventData, EditFormErrors } from './CalendarEventDetail';
export type { CalendarViewType } from './CalendarHeader';

// AI components
export * from './ai/SchedulingDrawer';
export * from './ai/TimeSlotPicker';

/**
 * Common Components
 * Shared components used across the application
 */

export { ErrorBoundary, PageErrorBoundary, SectionErrorBoundary } from './ErrorBoundary';
export { PageContainer } from './PageContainer';
export { EmptyState } from './EmptyState';
export { QueryErrorAlert } from './QueryErrorAlert';
export {
  ColorPicker,
  ColorPickerPopover,
  DEFAULT_PRESET_COLORS,
  getContrastColor,
  isValidHexColor,
  type ColorOption,
} from './ColorPicker';
export { SlaBadge } from './SlaBadge';
export { EntityContextSidebar, type EntityContextSidebarProps } from './EntityContextSidebar';
export { ActivityTimeline, type ActivityTimelineProps, type ActivityEvent } from './ActivityTimeline';
export { CrmBreadcrumb, type CrmBreadcrumbProps } from './CrmBreadcrumb';

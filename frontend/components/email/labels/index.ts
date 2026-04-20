/**
 * Label Management Components and Utilities
 *
 * Components, hooks, and utilities for creating, editing, and managing email labels.
 */

// Components
export { LabelColorPicker } from './LabelColorPicker';
export { LabelDialog } from './LabelDialog';
export { LabelPickerDialog } from './LabelPickerDialog';
export { LabelContextMenu } from './LabelContextMenu';
export { LabelDeleteDialog } from './LabelDeleteDialog';

// Hooks
export { useLabelManagement, type LabelManagementState } from './useLabelManagement';

export * from './LabelAccuracyBadge';

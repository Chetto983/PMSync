/**
 * Shared label management hook
 *
 * Provides common state and handlers for label create/edit/delete operations.
 * Used by both desktop (LabelsSidebar) and mobile (MobileFolderSheet) components.
 */

import { useState, useCallback, useMemo } from 'react';
import { useLabels } from '@/hooks/queries';
import type { Label } from '@/lib/api/labels';

/**
 * Hook return type
 */
export interface LabelManagementState {
  // Dialog state
  labelDialogOpen: boolean;
  editingLabel: Label | null;

  // Context menu state
  labelMenuAnchor: HTMLElement | null;
  selectedLabel: Label | null;

  // Handlers
  openCreateDialog: () => void;
  openEditDialog: (label: Label) => void;
  closeDialog: () => void;
  openContextMenu: (event: React.MouseEvent<HTMLElement>, label: Label) => void;
  closeContextMenu: () => void;

  // Data
  userLabels: Label[];
  isLoading: boolean;
}

/**
 * Shared label management hook
 *
 * Encapsulates all label management state and handlers
 * to avoid code duplication between desktop and mobile components.
 *
 * @example
 * ```tsx
 * const {
 *   labelDialogOpen,
 *   openCreateDialog,
 *   closeDialog,
 *   userLabels,
 * } = useLabelManagement();
 * ```
 */
export function useLabelManagement(): LabelManagementState {
  const { data: labels, isLoading } = useLabels();

  // Dialog state
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);

  // Context menu state
  const [labelMenuAnchor, setLabelMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);

  // Filter to show only USER labels (not SYSTEM)
  const userLabels = useMemo(
    () => labels?.filter((l) => l.type === 'USER') || [],
    [labels]
  );

  // ==========================================================================
  // Dialog Handlers
  // ==========================================================================

  /**
   * Open create label dialog
   */
  const openCreateDialog = useCallback(() => {
    setEditingLabel(null);
    setLabelDialogOpen(true);
  }, []);

  /**
   * Open edit label dialog
   */
  const openEditDialog = useCallback((label: Label) => {
    setEditingLabel(label);
    setLabelDialogOpen(true);
  }, []);

  /**
   * Close label dialog
   */
  const closeDialog = useCallback(() => {
    setLabelDialogOpen(false);
    setEditingLabel(null);
  }, []);

  // ==========================================================================
  // Context Menu Handlers
  // ==========================================================================

  /**
   * Open label context menu
   */
  const openContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, label: Label) => {
      event.preventDefault();
      event.stopPropagation();
      setLabelMenuAnchor(event.currentTarget);
      setSelectedLabel(label);
    },
    []
  );

  /**
   * Close label context menu
   * Note: Don't clear selectedLabel - child dialogs still need it
   */
  const closeContextMenu = useCallback(() => {
    setLabelMenuAnchor(null);
  }, []);

  return {
    // Dialog state
    labelDialogOpen,
    editingLabel,

    // Context menu state
    labelMenuAnchor,
    selectedLabel,

    // Handlers
    openCreateDialog,
    openEditDialog,
    closeDialog,
    openContextMenu,
    closeContextMenu,

    // Data
    userLabels,
    isLoading,
  };
}

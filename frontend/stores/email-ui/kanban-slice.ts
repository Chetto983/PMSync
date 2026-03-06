/**
 * Kanban Slice - Kanban board state and actions
 */

import type { EmailUIState, KanbanColumnAssignments, KanbanColumnId } from './email-ui-types';

type SetFn = (fn: ((state: EmailUIState) => Partial<EmailUIState>) | Partial<EmailUIState>) => void;
type GetFn = () => EmailUIState;

export function createKanbanSlice(set: SetFn, get: GetFn) {
  return {
    kanbanAssignments: {} as KanbanColumnAssignments,

    setEmailKanbanColumn: (emailId: string, columnId: KanbanColumnId) =>
      set((state) => ({
        kanbanAssignments: { ...state.kanbanAssignments, [emailId]: columnId },
      })),

    moveEmailToColumn: (emailId: string, columnId: KanbanColumnId) =>
      set((state) => ({
        kanbanAssignments: { ...state.kanbanAssignments, [emailId]: columnId },
      })),

    getEmailColumn: (emailId: string): KanbanColumnId => {
      const assignments = get().kanbanAssignments;
      return assignments[emailId] || 'inbox';
    },

    clearKanbanAssignments: () =>
      set({ kanbanAssignments: {} }),

    pruneKanbanAssignments: (validEmailIds: Set<string>) =>
      set((state) => {
        const pruned: KanbanColumnAssignments = {};
        for (const [id, col] of Object.entries(state.kanbanAssignments)) {
          if (validEmailIds.has(id)) {
            pruned[id] = col;
          }
        }
        return { kanbanAssignments: pruned };
      }),
  };
}

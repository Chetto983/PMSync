/**
 * Email Kanban Components
 *
 * Kanban board for email workflow management.
 * Allows users to organize emails in columns: Inbox, To Reply, Following Up, Done.
 *
 * NOTE: Column assignments are LOCAL ONLY (stored in Zustand with localStorage persistence).
 * Backend API for kanban status persistence is out of scope for Phase 06-02.
 */

export { EmailKanbanBoard } from './EmailKanbanBoard';
export { EmailKanbanColumn } from './EmailKanbanColumn';
export { EmailKanbanCard } from './EmailKanbanCard';

import { create } from 'zustand';
import { labelsApi, type Label, hexToLabelColor } from '@/lib/api/labels';

interface LabelStore {
  labels: Label[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchLabels: () => Promise<void>;
  createLabel: (name: string, colorHex: string) => Promise<Label>;
  updateLabel: (labelId: string, name?: string, colorHex?: string) => Promise<Label>;
  deleteLabel: (labelId: string) => Promise<void>;
  reorderLabels: (labelIds: string[]) => Promise<void>;
  addEmailsToLabel: (labelId: string, emailIds: string[]) => Promise<{ count: number; emails: any[] }>;
  removeEmailFromLabel: (labelId: string, emailId: string) => Promise<{ email: any }>;

  // Helpers
  getLabelById: (labelId: string) => Label | undefined;
  getLabelByName: (name: string) => Label | undefined;
  getEmailCountForLabel: (labelId: string) => number;

  // WebSocket event handlers
  handleLabelCreated: (label: Label) => void;
  handleLabelUpdated: (label: Label) => void;
  handleLabelDeleted: (labelId: string) => void;
}

export const useLabelStore = create<LabelStore>((set, get) => ({
  labels: [],
  isLoading: false,
  error: null,

  fetchLabels: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await labelsApi.listLabels();
      set({ labels: response.labels, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch labels:', error);
      set({ error: 'Failed to fetch labels', isLoading: false });
      throw error;
    }
  },

  createLabel: async (name: string, colorHex: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await labelsApi.createLabel({
        name,
        color: hexToLabelColor(colorHex),
      });
      const newLabel = response.label;
      set((state) => ({
        labels: [...state.labels, newLabel],
        isLoading: false,
      }));
      return newLabel;
    } catch (error) {
      console.error('Failed to create label:', error);
      set({ error: 'Failed to create label', isLoading: false });
      throw error;
    }
  },

  updateLabel: async (labelId: string, name?: string, colorHex?: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await labelsApi.updateLabel(labelId, {
        name,
        color: colorHex ? hexToLabelColor(colorHex) : undefined,
      });
      const updatedLabel = response.label;
      set((state) => ({
        labels: state.labels.map((label) =>
          label.id === labelId ? updatedLabel : label
        ),
        isLoading: false,
      }));
      return updatedLabel;
    } catch (error) {
      console.error('Failed to update label:', error);
      set({ error: 'Failed to update label', isLoading: false });
      throw error;
    }
  },

  deleteLabel: async (labelId: string) => {
    set({ isLoading: true, error: null });
    try {
      await labelsApi.deleteLabel(labelId);
      set((state) => ({
        labels: state.labels.filter((label) => label.id !== labelId),
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to delete label:', error);
      set({ error: 'Failed to delete label', isLoading: false });
      throw error;
    }
  },

  reorderLabels: async (labelIds: string[]) => {
    // Optimistic update
    const previousLabels = get().labels;
    const reorderedLabels = labelIds
      .map((id) => previousLabels.find((label) => label.id === id))
      .filter((label): label is Label => label !== undefined);

    set({ labels: reorderedLabels });

    try {
      await labelsApi.reorderLabels({ labelIds });
    } catch (error) {
      console.error('Failed to reorder labels:', error);
      // Revert on error
      set({ labels: previousLabels, error: 'Failed to reorder labels' });
      throw error;
    }
  },

  addEmailsToLabel: async (labelId: string, emailIds: string[]) => {
    try {
      const result = await labelsApi.addEmailsToLabel(labelId, { emailIds });
      return result;
    } catch (error) {
      console.error('Failed to add emails to label:', error);
      throw error;
    }
  },

  removeEmailFromLabel: async (labelId: string, emailId: string) => {
    try {
      const result = await labelsApi.removeEmailFromLabel(labelId, emailId);
      return result;
    } catch (error) {
      console.error('Failed to remove email from label:', error);
      throw error;
    }
  },

  getLabelById: (labelId: string) => {
    return get().labels.find((label) => label.id === labelId);
  },

  getLabelByName: (name: string) => {
    return get().labels.find((label) => label.name === name);
  },

  getEmailCountForLabel: (_labelId: string) => {
    // This would need to be tracked separately or fetched from backend
    // For now, return 0 as placeholder
    return 0;
  },

  // WebSocket event handlers
  handleLabelCreated: (label: Label) => {
    set((state) => {
      // Check if label already exists (prevent duplicates)
      if (state.labels.some((l) => l.id === label.id)) {
        return state;
      }
      return { labels: [...state.labels, label] };
    });
  },

  handleLabelUpdated: (label: Label) => {
    set((state) => ({
      labels: state.labels.map((l) => (l.id === label.id ? label : l)),
    }));
  },

  handleLabelDeleted: (labelId: string) => {
    set((state) => ({
      labels: state.labels.filter((l) => l.id !== labelId),
    }));
  },
}));

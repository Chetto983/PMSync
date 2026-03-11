import { useDashboardStore } from './dashboard-store';

beforeEach(() => {
  useDashboardStore.setState(
    { editMode: false, libraryOpen: false, presetsOpen: false, selectedWidget: null },
  );
});

describe('useDashboardStore', () => {
  describe('toggleEditMode', () => {
    it('flips editMode from false to true', () => {
      useDashboardStore.getState().toggleEditMode();
      expect(useDashboardStore.getState().editMode).toBe(true);
    });

    it('flips editMode back to false', () => {
      useDashboardStore.getState().toggleEditMode();
      useDashboardStore.getState().toggleEditMode();
      expect(useDashboardStore.getState().editMode).toBe(false);
    });
  });

  describe('setEditMode', () => {
    it('sets editMode to true', () => {
      useDashboardStore.getState().setEditMode(true);
      expect(useDashboardStore.getState().editMode).toBe(true);
    });

    it('sets editMode to false', () => {
      useDashboardStore.getState().setEditMode(true);
      useDashboardStore.getState().setEditMode(false);
      expect(useDashboardStore.getState().editMode).toBe(false);
    });
  });

  describe('setLibraryOpen', () => {
    it('sets libraryOpen to true', () => {
      useDashboardStore.getState().setLibraryOpen(true);
      expect(useDashboardStore.getState().libraryOpen).toBe(true);
    });
  });

  describe('setPresetsOpen', () => {
    it('sets presetsOpen to true', () => {
      useDashboardStore.getState().setPresetsOpen(true);
      expect(useDashboardStore.getState().presetsOpen).toBe(true);
    });
  });

  describe('setSelectedWidget', () => {
    it('sets selectedWidget', () => {
      useDashboardStore.getState().setSelectedWidget('briefing');
      expect(useDashboardStore.getState().selectedWidget).toBe('briefing');
    });

    it('clears selectedWidget when set to null', () => {
      useDashboardStore.getState().setSelectedWidget('briefing');
      useDashboardStore.getState().setSelectedWidget(null);
      expect(useDashboardStore.getState().selectedWidget).toBeNull();
    });
  });
});

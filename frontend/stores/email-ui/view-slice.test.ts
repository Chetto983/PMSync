import { useEmailUIStore } from '../email-ui-store';

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('view slice', () => {
  describe('setViewMode', () => {
    it('sets viewMode to thread', () => {
      useEmailUIStore.getState().setViewMode('thread');
      expect(useEmailUIStore.getState().viewMode).toBe('thread');
    });
  });

  describe('setDensity', () => {
    it('sets density to compact', () => {
      useEmailUIStore.getState().setDensity('compact');
      expect(useEmailUIStore.getState().density).toBe('compact');
    });
  });

  describe('togglePreviewPanel', () => {
    it('flips previewPanelOpen', () => {
      const initial = useEmailUIStore.getState().previewPanelOpen;
      useEmailUIStore.getState().togglePreviewPanel();
      expect(useEmailUIStore.getState().previewPanelOpen).toBe(!initial);
    });

    it('flips back when called twice', () => {
      const initial = useEmailUIStore.getState().previewPanelOpen;
      useEmailUIStore.getState().togglePreviewPanel();
      useEmailUIStore.getState().togglePreviewPanel();
      expect(useEmailUIStore.getState().previewPanelOpen).toBe(initial);
    });
  });

  describe('setActiveEmail', () => {
    it('sets activeEmailId', () => {
      useEmailUIStore.getState().setActiveEmail('e1');
      expect(useEmailUIStore.getState().activeEmailId).toBe('e1');
    });

    it('sets selectedIds as singleton Set containing the id', () => {
      useEmailUIStore.getState().setActiveEmail('e1');
      expect(useEmailUIStore.getState().selectedIds.has('e1')).toBe(true);
      expect(useEmailUIStore.getState().selectedIds.size).toBe(1);
    });

    it('clears activeEmailId when null', () => {
      useEmailUIStore.getState().setActiveEmail('e1');
      useEmailUIStore.getState().setActiveEmail(null);
      expect(useEmailUIStore.getState().activeEmailId).toBeNull();
    });

    it('clears selectedIds when null', () => {
      useEmailUIStore.getState().setActiveEmail('e1');
      useEmailUIStore.getState().setActiveEmail(null);
      expect(useEmailUIStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('setActiveThread', () => {
    it('sets activeThreadId and switches viewMode to thread', () => {
      useEmailUIStore.getState().setActiveThread('t1');
      expect(useEmailUIStore.getState().activeThreadId).toBe('t1');
      expect(useEmailUIStore.getState().viewMode).toBe('thread');
    });

    it('clears activeThreadId and switches viewMode to list when null', () => {
      useEmailUIStore.getState().setActiveThread('t1');
      useEmailUIStore.getState().setActiveThread(null);
      expect(useEmailUIStore.getState().activeThreadId).toBeNull();
      expect(useEmailUIStore.getState().viewMode).toBe('list');
    });
  });
});

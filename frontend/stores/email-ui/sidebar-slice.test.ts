import { useEmailUIStore } from '../email-ui-store';

// initialSidebar from email-ui-types: { width: 220, minWidth: 180, maxWidth: 350 }

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('sidebar slice', () => {
  describe('setSidebarWidth', () => {
    it('sets sidebar width within bounds', () => {
      useEmailUIStore.getState().setSidebarWidth(250);
      expect(useEmailUIStore.getState().sidebar.width).toBe(250);
    });

    it('clamps width to minWidth', () => {
      useEmailUIStore.getState().setSidebarWidth(100);
      expect(useEmailUIStore.getState().sidebar.width).toBe(180);
    });

    it('clamps width to maxWidth', () => {
      useEmailUIStore.getState().setSidebarWidth(500);
      expect(useEmailUIStore.getState().sidebar.width).toBe(350);
    });
  });

  describe('toggleProviderCollapse', () => {
    it('adds providerId to collapsedProviders when not collapsed', () => {
      useEmailUIStore.getState().toggleProviderCollapse('p1');
      expect(useEmailUIStore.getState().sidebar.collapsedProviders.has('p1')).toBe(true);
    });

    it('removes providerId from collapsedProviders when already collapsed', () => {
      useEmailUIStore.getState().toggleProviderCollapse('p1');
      useEmailUIStore.getState().toggleProviderCollapse('p1');
      expect(useEmailUIStore.getState().sidebar.collapsedProviders.has('p1')).toBe(false);
    });
  });

  describe('setProviderCollapsed', () => {
    it('collapses a provider', () => {
      useEmailUIStore.getState().setProviderCollapsed('p1', true);
      expect(useEmailUIStore.getState().sidebar.collapsedProviders.has('p1')).toBe(true);
    });

    it('uncollapses a provider', () => {
      useEmailUIStore.getState().setProviderCollapsed('p1', true);
      useEmailUIStore.getState().setProviderCollapsed('p1', false);
      expect(useEmailUIStore.getState().sidebar.collapsedProviders.has('p1')).toBe(false);
    });
  });
});

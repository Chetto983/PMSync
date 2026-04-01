import { getActiveSidebarHref } from './sidebar-navigation';

describe('getActiveSidebarHref', () => {
  it('marks home as active only on the exact dashboard route', () => {
    expect(getActiveSidebarHref('/dashboard')).toBe('/dashboard');
    expect(getActiveSidebarHref('/dashboard/email')).toBe('/dashboard/email');
    expect(getActiveSidebarHref('/dashboard/email/thread/123')).toBe('/dashboard/email');
  });

  it('keeps nested module routes on their owning pillar', () => {
    expect(getActiveSidebarHref('/dashboard/calendar/day')).toBe('/dashboard/calendar');
    expect(getActiveSidebarHref('/dashboard/contacts/abc')).toBe('/dashboard/contacts');
    expect(getActiveSidebarHref('/dashboard/tasks/board')).toBe('/dashboard/tasks');
  });

  it('returns null for routes that do not belong to a primary pillar', () => {
    expect(getActiveSidebarHref('/dashboard/settings')).toBeNull();
    expect(getActiveSidebarHref('/dashboard/ai')).toBeNull();
  });
});

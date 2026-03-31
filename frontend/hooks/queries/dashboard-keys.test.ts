import { dashboardKeys } from './dashboard-keys';

describe('dashboardKeys briefing locale handling', () => {
  it('includes locale in the briefing query key', () => {
    expect(dashboardKeys.briefing('it')).toEqual(['dashboard', 'briefing', 'it']);
  });

  it('falls back to a stable default briefing key when locale is missing', () => {
    expect(dashboardKeys.briefing()).toEqual(['dashboard', 'briefing', 'default']);
  });
});

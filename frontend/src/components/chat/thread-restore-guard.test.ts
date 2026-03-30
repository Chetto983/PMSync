import {
  markManualNewThreadRequested,
  resetManualNewThreadRequested,
  shouldSkipInitialThreadRestore,
} from './thread-restore-guard';

describe('thread-restore-guard', () => {
  afterEach(() => {
    resetManualNewThreadRequested();
  });

  it('skips the initial restore shortly after an explicit new chat request', () => {
    markManualNewThreadRequested(1_000);

    expect(shouldSkipInitialThreadRestore(1_500)).toBe(true);
  });

  it('expires the guard after the grace window', () => {
    markManualNewThreadRequested(1_000);

    expect(shouldSkipInitialThreadRestore(17_000)).toBe(false);
  });
});

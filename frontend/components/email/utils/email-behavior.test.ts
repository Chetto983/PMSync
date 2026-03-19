import {
  emailUpdateTouchesCurrentFolder,
  getDraggedEmailIds,
  getEffectiveEmailListPage,
} from './email-behavior';

describe('email-behavior', () => {
  describe('getEffectiveEmailListPage', () => {
    it('keeps the current page when the filter is unchanged', () => {
      expect(
        getEffectiveEmailListPage({
          page: 4,
          filterKey: 'inbox',
          previousFilterKey: 'inbox',
        }),
      ).toBe(4);
    });

    it('resets back to page 1 during a filter transition', () => {
      expect(
        getEffectiveEmailListPage({
          page: 4,
          filterKey: 'archive',
          previousFilterKey: 'inbox',
        }),
      ).toBe(1);
    });
  });

  describe('getDraggedEmailIds', () => {
    it('moves the full selection when the dragged row is selected', () => {
      expect(getDraggedEmailIds('email-2', ['email-1', 'email-2'])).toEqual([
        'email-1',
        'email-2',
      ]);
    });

    it('falls back to the active row when dragging an unselected row', () => {
      expect(getDraggedEmailIds('email-3', ['email-1', 'email-2'])).toEqual([
        'email-3',
      ]);
    });
  });

  describe('emailUpdateTouchesCurrentFolder', () => {
    it('matches the destination folder', () => {
      expect(
        emailUpdateTouchesCurrentFolder('INBOX', { folder: 'INBOX' }),
      ).toBe(true);
    });

    it('matches the source folder for move events', () => {
      expect(
        emailUpdateTouchesCurrentFolder('INBOX', {
          folder: 'Archive',
          sourceFolder: 'INBOX',
        }),
      ).toBe(true);
    });

    it('ignores unrelated folders', () => {
      expect(
        emailUpdateTouchesCurrentFolder('INBOX', {
          folder: 'Archive',
          sourceFolder: 'Spam',
        }),
      ).toBe(false);
    });

    it('keeps updates with no folder metadata broad instead of dropping them', () => {
      expect(emailUpdateTouchesCurrentFolder('INBOX', {})).toBe(true);
    });
  });
});

import { formatListDate, formatEmailHeaderDate, parseEmailFrom, scrollContainerSx } from '@/components/email/shared/utils';

describe('email shared utils', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parseEmailFrom should split name and email', () => {
    expect(parseEmailFrom('John Doe <john@example.com>')).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
    });

    expect(parseEmailFrom('single@example.com')).toEqual({
      name: 'single@example.com',
      email: 'single@example.com',
    });
  });

  it('formatListDate should pick time for recent messages', () => {
    const timeSpy = jest.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('TIME');
    const result = formatListDate(new Date());
    expect(result).toBe('TIME');
    expect(timeSpy).toHaveBeenCalled();
  });

  it('formatListDate should pick weekday within the last week', () => {
    const dateSpy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('WEEKDAY');
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const result = formatListDate(twoDaysAgo);
    expect(result).toBe('WEEKDAY');
    expect(dateSpy).toHaveBeenCalled();
  });

  it('formatListDate should pick month/day for older messages', () => {
    const dateSpy = jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('MONTHDAY');
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    const result = formatListDate(oldDate);
    expect(result).toBe('MONTHDAY');
    expect(dateSpy).toHaveBeenCalled();
  });

  it('formatEmailHeaderDate should delegate to toLocaleString', () => {
    const localeSpy = jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('HEADER');
    const result = formatEmailHeaderDate(new Date());
    expect(result).toBe('HEADER');
    expect(localeSpy).toHaveBeenCalled();
  });

  it('scrollContainerSx should define scrollbar styling', () => {
    expect(scrollContainerSx).toEqual(
      expect.objectContaining({
        scrollbarWidth: 'thin',
      })
    );
  });
});

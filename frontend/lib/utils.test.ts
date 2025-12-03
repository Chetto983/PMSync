import { cn } from './utils';

describe('cn (className utility)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    expect(cn('base', true && 'active', false && 'disabled')).toBe('base active');
  });

  it('should handle undefined and null values', () => {
    expect(cn('base', undefined, null, 'other')).toBe('base other');
  });

  it('should handle empty strings', () => {
    expect(cn('base', '', 'other')).toBe('base other');
  });

  it('should merge conflicting Tailwind classes (tailwind-merge)', () => {
    // tailwind-merge should dedupe conflicting classes
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    expect(cn('bg-white', 'bg-black')).toBe('bg-black');
  });

  it('should handle array of classes via clsx', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });

  it('should handle object syntax via clsx', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('should handle mixed inputs', () => {
    const isActive = true;
    const isDisabled = false;
    expect(
      cn(
        'base-class',
        isActive && 'active',
        isDisabled && 'disabled',
        { hover: true, focus: false },
        ['array-class'],
      ),
    ).toBe('base-class active hover array-class');
  });

  it('should handle responsive Tailwind classes', () => {
    expect(cn('md:px-2', 'md:px-4')).toBe('md:px-4');
    expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe('hover:bg-blue-500');
  });

  it('should return empty string for no valid inputs', () => {
    expect(cn()).toBe('');
    expect(cn(undefined, null, false)).toBe('');
  });
});

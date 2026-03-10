import { validateEmbeddingVector } from '../vector-validation';

describe('validateEmbeddingVector', () => {
  it('returns the same array for valid finite numbers', () => {
    expect(validateEmbeddingVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('accepts negative and decimal numbers', () => {
    expect(validateEmbeddingVector([-0.5, 0, 0.999])).toEqual([-0.5, 0, 0.999]);
  });

  it('throws when input is not an array', () => {
    expect(() => validateEmbeddingVector('string' as any)).toThrow(
      'must be an array',
    );
  });

  it('throws for empty array', () => {
    expect(() => validateEmbeddingVector([])).toThrow('cannot be empty');
  });

  it('throws for NaN values', () => {
    expect(() => validateEmbeddingVector([NaN])).toThrow(
      'expected finite number',
    );
  });

  it('throws for Infinity values', () => {
    expect(() => validateEmbeddingVector([Infinity])).toThrow(
      'expected finite number',
    );
  });

  it('throws for -Infinity values', () => {
    expect(() => validateEmbeddingVector([-Infinity])).toThrow(
      'expected finite number',
    );
  });

  it('throws for mixed valid and invalid values', () => {
    expect(() => validateEmbeddingVector([1, 'a', 3])).toThrow(
      'expected finite number',
    );
  });

  it('throws when array exceeds maximum dimension (4096)', () => {
    expect(() =>
      validateEmbeddingVector(new Array(4097).fill(0)),
    ).toThrow('exceeds maximum dimension');
  });

  it('accepts array at exactly maximum dimension (4096)', () => {
    const arr = new Array(4096).fill(0.1);
    const result = validateEmbeddingVector(arr);
    expect(result).toHaveLength(4096);
  });
});

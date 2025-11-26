// Mock for p-retry ESM module
export default function pRetry<T>(
  fn: (attemptCount: number) => PromiseLike<T> | T,
  _options?: Record<string, unknown>,
): Promise<T> {
  // Just run the function once without retry logic
  return Promise.resolve(fn(1));
}

export class AbortError extends Error {
  readonly name = 'AbortError';
  readonly originalError: Error;

  constructor(message: string | Error) {
    super();
    if (message instanceof Error) {
      this.originalError = message;
      this.message = message.message;
    } else {
      this.originalError = new Error(message);
      this.message = message;
    }
  }
}

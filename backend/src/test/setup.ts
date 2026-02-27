import { setupServer } from 'msw/node';
import { handlers } from './msw-handlers';

// MSW server with Mistral API handlers for deterministic testing.
// Usage in test files:
//   import { mswServer } from '../test/setup';
//   beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
//   afterEach(() => mswServer.resetHandlers());
//   afterAll(() => mswServer.close());
export const mswServer = setupServer(...handlers);

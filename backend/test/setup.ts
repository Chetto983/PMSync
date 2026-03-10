/**
 * Jest setup file for backend tests
 */

// Extend Jest timeout for slower operations
jest.setTimeout(30000);

// Global test utilities
beforeAll(() => {
  // Silence console during tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'debug').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

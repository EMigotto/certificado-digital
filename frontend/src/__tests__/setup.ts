import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, afterAll, beforeAll } from 'vitest';
import { server } from './mocks/server';

/**
 * Vitest global setup for frontend tests.
 * - Starts MSW mock server before all tests
 * - Resets handlers between tests
 * - Cleans up DOM after each test
 * - Stops MSW server after all tests
 */

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

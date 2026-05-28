import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * MSW mock server instance for tests.
 * Uses the shared handlers from ./handlers.ts.
 */
export const server = setupServer(...handlers);

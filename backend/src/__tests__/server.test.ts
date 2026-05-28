import { describe, it, expect } from 'vitest';
import { buildServer } from '../server.js';

describe('server', () => {
  it('should respond to /health', async () => {
    const server = await buildServer();
    const response = await server.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    await server.close();
  });
});

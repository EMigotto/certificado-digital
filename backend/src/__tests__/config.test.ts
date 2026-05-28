import { describe, it, expect } from 'vitest';

describe('config', () => {
  it('should parse default environment values', async () => {
    // config module reads process.env on import — defaults are valid
    const { config } = await import('../config.js');
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.NODE_ENV).toBe('test');
  });
});

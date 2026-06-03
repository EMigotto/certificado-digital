import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';

describe('OpenAPI / Swagger documentation', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // ── F1 Scenario: OpenAPI specification is accessible at documentation endpoints ──

  it('GET /api/docs should serve Swagger UI', async () => {
    // /api/docs/static/index.html redirects to /api/docs/
    const redirect = await server.inject({
      method: 'GET',
      url: '/api/docs/static/index.html',
    });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toContain('/api/docs');

    // Follow the redirect — the final page returns the Swagger UI HTML
    const response = await server.inject({
      method: 'GET',
      url: redirect.headers.location as string,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.payload).toContain('swagger');
  });

  // ── F1 Scenario: OpenAPI JSON schema is available for tooling ──

  it('GET /api/docs/json should return valid OpenAPI 3.0.0 spec', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const spec = JSON.parse(response.payload);

    // Must be OpenAPI 3.0.x
    expect(spec.openapi).toMatch(/^3\.0\.\d+$/);

    // Must have info block
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('Certificado Digital API');
    expect(spec.info.version).toBe('1.0.0');

    // Must have paths defined
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });

  // ── F1 Scenario: Certificate GET endpoint is documented with correct schema ──

  it('OpenAPI spec includes GET /api/certificates with correct schema', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    // /api/certificates should exist
    expect(spec.paths['/api/certificates']).toBeDefined();

    const getOp = spec.paths['/api/certificates'].get;
    expect(getOp).toBeDefined();

    // Should have a tag
    expect(getOp.tags).toContain('Certificates');

    // Should have 200 response defined
    expect(getOp.responses['200']).toBeDefined();
  });

  it('OpenAPI spec includes GET /api/certificates/:id with detail schema', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    // /api/certificates/{id} should exist
    expect(spec.paths['/api/certificates/{id}']).toBeDefined();

    const getOp = spec.paths['/api/certificates/{id}'].get;
    expect(getOp).toBeDefined();
    expect(getOp.tags).toContain('Certificates');

    // Should have 200 and 404 responses
    expect(getOp.responses['200']).toBeDefined();
    expect(getOp.responses['404']).toBeDefined();
  });

  // ── F1 Scenario: Token creation endpoint requires Bearer authentication in schema ──

  it('OpenAPI spec defines BearerAuth security scheme', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    // Security scheme should be defined
    expect(spec.components?.securitySchemes?.BearerAuth).toBeDefined();

    const bearerScheme = spec.components.securitySchemes.BearerAuth;
    expect(bearerScheme.type).toBe('http');
    expect(bearerScheme.scheme).toBe('bearer');
  });

  it('DELETE /api/certificates/:id requires Bearer auth in spec', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    const deleteOp = spec.paths['/api/certificates/{id}']?.delete;
    expect(deleteOp).toBeDefined();
    expect(deleteOp.security).toBeDefined();
    expect(deleteOp.security).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ BearerAuth: [] }),
      ]),
    );
  });

  // ── F1 Scenario: Invalid path is not in OpenAPI schema ──

  it('OpenAPI spec does not include non-existent paths', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    // Random paths should not appear
    expect(spec.paths['/api/nonexistent']).toBeUndefined();
    expect(spec.paths['/api/foo/bar']).toBeUndefined();
  });

  // ── Additional structural checks ──

  it('OpenAPI spec includes health endpoint', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    expect(spec.paths['/health']).toBeDefined();
    expect(spec.paths['/health'].get).toBeDefined();
    expect(spec.paths['/health'].get.tags).toContain('Health');
  });

  it('OpenAPI spec includes tags for API organization', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    expect(spec.tags).toBeDefined();
    expect(Array.isArray(spec.tags)).toBe(true);

    const tagNames = spec.tags.map((t: { name: string }) => t.name);
    expect(tagNames).toContain('Certificates');
    expect(tagNames).toContain('Health');
  });

  it('OpenAPI spec has servers array defined', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    expect(spec.servers).toBeDefined();
    expect(spec.servers.length).toBeGreaterThan(0);
    expect(spec.servers[0].url).toBe('http://localhost:3000');
  });

  it('OpenAPI spec filter metadata endpoint is documented', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/docs/json',
    });
    const spec = JSON.parse(response.payload);

    expect(spec.paths['/api/meta/filters']).toBeDefined();
    expect(spec.paths['/api/meta/filters'].get).toBeDefined();
  });
});

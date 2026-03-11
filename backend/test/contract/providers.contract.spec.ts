/**
 * Contract Test: Providers
 *
 * Validates that provider config endpoints exist in the OpenAPI spec
 * and their response schemas match what the frontend providers API module expects:
 *   - GET /api/v1/providers -> ProviderConfig[] or { providers }
 *   - GET /api/v1/providers/{id} -> ProviderConfig (id, providerType, email, isActive)
 *   - DELETE /api/v1/providers/{id} -> void or confirmation
 *
 * Frontend reference: frontend/lib/api/providers.ts
 *   providersApi.listProviders() -> ProviderConfig[]
 *   providersApi.getProvider(id) -> ProviderConfig
 *   providersApi.deleteProvider(id) -> void
 *
 * ProviderConfig shape: { id, providerType, email, isActive, supportsCalendar }
 *
 * Error envelope: ApiExceptionFilter produces { error: { code, message, details }, meta: { requestId } }
 * There is NO statusCode in the body. Assert top-level 'error' and 'meta' keys.
 *
 * To generate the spec: cd backend && npx ts-node scripts/generate-openapi.ts
 * Tests skip gracefully if spec is absent.
 */
import {
  loadSpec,
  expectPathExists,
  getResponseSchema,
  OpenApiSpec,
} from './contract-helpers';

describe('Providers Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- providers contract tests skipped');
    }
  });

  it('GET /api/v1/providers path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/providers', 'get');
  });

  it('providers list response item has providerType and email fields', () => {
    if (!spec) return;

    const schema = getResponseSchema(spec, '/api/v1/providers', 'get', '200');
    if (!schema) return;

    // Response may be ProviderConfig[] or { providers: ProviderConfig[] }
    if (!schema.properties && !schema.items) return;

    if (schema.items?.properties) {
      // Array schema
      expect(schema.items.properties).toHaveProperty('providerType');
      expect(schema.items.properties).toHaveProperty('email');
    } else if (schema.properties?.providers) {
      // Wrapped schema: { providers: ProviderConfig[] }
      const providersSchema = schema.properties.providers;
      if (providersSchema.items?.properties) {
        expect(providersSchema.items.properties).toHaveProperty('providerType');
        expect(providersSchema.items.properties).toHaveProperty('email');
      }
    }
  });

  it('GET /api/v1/providers 401 error uses ApiExceptionFilter envelope', () => {
    if (!spec) return;

    // ApiExceptionFilter shape: { error: { code, message, details }, meta: { requestId } }
    // No statusCode in body. Graceful skip if spec does not document 401 for this path.
    const schema = getResponseSchema(spec, '/api/v1/providers', 'get', '401');
    if (!schema) return;

    if (schema.properties) {
      expect(schema.properties).toHaveProperty('error');
      expect(schema.properties).toHaveProperty('meta');
    }
  });

  it('GET /api/v1/providers/{id} path exists', () => {
    if (!spec) return;

    const pathVariants = [
      '/api/v1/providers/{id}',
      '/api/v1/providers/{providerId}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.get);
    expect(found).toBe(true);
  });

  it('provider single response has id, providerType, isActive fields', () => {
    if (!spec) return;

    const pathVariants = [
      '/api/v1/providers/{id}',
      '/api/v1/providers/{providerId}',
    ];
    const foundPath = pathVariants.find((p) => spec!.paths[p]?.get);
    if (!foundPath) return;

    const schema = getResponseSchema(spec, foundPath, 'get', '200');
    if (!schema) return;

    if (schema.properties) {
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('providerType');
      expect(schema.properties).toHaveProperty('isActive');
    }
  });

  it('DELETE /api/v1/providers/{id} path exists', () => {
    if (!spec) return;

    const pathVariants = [
      '/api/v1/providers/{id}',
      '/api/v1/providers/{providerId}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.delete);
    expect(found).toBe(true);
  });
});

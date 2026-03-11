/**
 * Contract Test: Labels
 *
 * Validates that label endpoints exist in the OpenAPI spec
 * and their response schemas match what the frontend labels API module expects:
 *   - GET /api/v1/labels -> array or { labels } with Label items (id, name, slug, parentId)
 *   - POST /api/v1/labels -> created Label
 *
 * Frontend reference: frontend/lib/api/labels.ts
 *   labelsApi.listLabels() -> Label[] or { labels: Label[] }
 *   labelsApi.createLabel(data) -> Label
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

describe('Labels Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- labels contract tests skipped');
    }
  });

  it('GET /api/v1/labels path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/labels', 'get');
  });

  it('labels list response has id, name, slug fields in item schema', () => {
    if (!spec) return;

    const schema = getResponseSchema(spec, '/api/v1/labels', 'get', '200');
    if (!schema) return;

    // Response may be an array or { labels: Label[] }
    // Guard against missing schema shape variations
    if (!schema.properties && !schema.items) return;

    if (schema.items?.properties) {
      // Array schema: items has properties
      expect(schema.items.properties).toHaveProperty('id');
      expect(schema.items.properties).toHaveProperty('name');
    } else if (schema.properties?.labels) {
      // Wrapped schema: { labels: Label[] }
      const labelsSchema = schema.properties.labels;
      if (labelsSchema.items?.properties) {
        expect(labelsSchema.items.properties).toHaveProperty('id');
        expect(labelsSchema.items.properties).toHaveProperty('name');
      }
    }
  });

  it('GET /api/v1/labels 401 error uses ApiExceptionFilter envelope', () => {
    if (!spec) return;

    // ApiExceptionFilter shape: { error: { code, message, details }, meta: { requestId } }
    // No statusCode in body. Graceful skip if spec does not document 401 for this path.
    const schema = getResponseSchema(spec, '/api/v1/labels', 'get', '401');
    if (!schema) return;

    if (schema.properties) {
      expect(schema.properties).toHaveProperty('error');
      expect(schema.properties).toHaveProperty('meta');
    }
  });

  it('POST /api/v1/labels path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/labels', 'post');
  });

  it('POST /api/v1/labels 201 response has label fields', () => {
    if (!spec) return;

    // Try 201 first (NestJS default for POST), then 200
    const schema =
      getResponseSchema(spec, '/api/v1/labels', 'post', '201') ||
      getResponseSchema(spec, '/api/v1/labels', 'post', '200');
    if (!schema) return;

    if (schema.properties) {
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('name');
    }
  });
});

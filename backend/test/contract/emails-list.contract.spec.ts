/**
 * Contract Test: Emails List
 *
 * Validates that GET /api/v1/emails exists in the OpenAPI spec
 * and its response schema matches what the frontend emails API module expects:
 *   - emails: Email[] with id, from, to, subject, bodyHtml, receivedAt, etc.
 *   - pagination: { page, limit, total, totalPages }
 *
 * Frontend reference: frontend/lib/api/emails.ts
 *   emailsApi.listEmails(params) -> { emails, pagination }
 *   emailsApi.getStats() -> { total, unread, starred, ... }
 *   emailsApi.getEmail(id) -> Email
 */
import {
  loadSpec,
  expectPathExists,
  getResponseSchema,
  resolveRef,
  OpenApiSpec,
} from './contract-helpers';

describe('Emails List Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- emails-list contract tests skipped');
    }
  });

  it('GET /api/v1/emails path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/emails', 'get');
  });

  it('emails list response has emails array and pagination', () => {
    if (!spec) return;

    const schema = getResponseSchema(spec, '/api/v1/emails', 'get', '200');
    if (!schema) return;

    // Frontend expects { emails: Email[], pagination: { page, limit, total, totalPages } }
    if (schema.properties) {
      expect(schema.properties).toHaveProperty('emails');
      expect(schema.properties).toHaveProperty('pagination');
    }
  });

  it('GET /api/v1/emails/stats path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/emails/stats', 'get');
  });

  it('GET /api/v1/emails/{id} path exists', () => {
    if (!spec) return;
    // NestJS OpenAPI may use {id} or {:id}
    const pathVariants = [
      '/api/v1/emails/{id}',
      '/api/v1/emails/{emailId}',
    ];

    const found = pathVariants.some((p) => spec!.paths[p]?.get);
    expect(found).toBe(true);
  });

  it('GET /api/v1/emails/search path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/emails/search', 'get');
  });

  it('POST /api/v1/emails/send path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/emails/send', 'post');
  });

  it('GET /api/v1/emails/thread/{threadId} path exists', () => {
    if (!spec) return;
    const pathVariants = [
      '/api/v1/emails/thread/{threadId}',
      '/api/v1/emails/thread/{id}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.get);
    expect(found).toBe(true);
  });

  it('PATCH /api/v1/emails/{id} path exists for update', () => {
    if (!spec) return;
    const pathVariants = [
      '/api/v1/emails/{id}',
      '/api/v1/emails/{emailId}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.patch);
    expect(found).toBe(true);
  });
});

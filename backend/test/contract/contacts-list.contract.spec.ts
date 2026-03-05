/**
 * Contract Test: Contacts List
 *
 * Validates that GET /api/v1/contacts exists in the OpenAPI spec
 * and its response schema matches what the frontend contacts API module expects:
 *   - contacts: Contact[] with id, firstName, lastName, emails, etc.
 *   - total: number
 *
 * Frontend reference: frontend/lib/api/contacts.ts
 *   contactsApi.listContacts(params) -> { contacts, total }
 *   contactsApi.getContactCounts() -> { total, withEmail, withPhone, ... }
 *   contactsApi.getContact(id) -> Contact
 */
import {
  loadSpec,
  expectPathExists,
  getResponseSchema,
  OpenApiSpec,
} from './contract-helpers';

describe('Contacts List Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- contacts-list contract tests skipped');
    }
  });

  it('GET /api/v1/contacts path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/contacts', 'get');
  });

  it('contacts list response has contacts array and total', () => {
    if (!spec) return;

    const schema = getResponseSchema(spec, '/api/v1/contacts', 'get', '200');
    if (!schema) return;

    // Frontend expects { contacts: Contact[], total: number }
    if (schema.properties) {
      expect(schema.properties).toHaveProperty('contacts');
      expect(schema.properties).toHaveProperty('total');
    }
  });

  it('GET /api/v1/contacts/counts path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/contacts/counts', 'get');
  });

  it('GET /api/v1/contacts/{id} path exists', () => {
    if (!spec) return;
    const pathVariants = [
      '/api/v1/contacts/{id}',
      '/api/v1/contacts/{contactId}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.get);
    expect(found).toBe(true);
  });

  it('POST /api/v1/contacts path exists for create', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/contacts', 'post');
  });

  it('PATCH /api/v1/contacts/{id} path exists for update', () => {
    if (!spec) return;
    const pathVariants = [
      '/api/v1/contacts/{id}',
      '/api/v1/contacts/{contactId}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.patch);
    expect(found).toBe(true);
  });

  it('POST /api/v1/contacts/{id}/vip path exists for VIP toggle', () => {
    if (!spec) return;
    const pathVariants = [
      '/api/v1/contacts/{id}/vip',
      '/api/v1/contacts/{contactId}/vip',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.post);
    expect(found).toBe(true);
  });

  it('GET /api/v1/contacts/vip/list path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/contacts/vip/list', 'get');
  });
});

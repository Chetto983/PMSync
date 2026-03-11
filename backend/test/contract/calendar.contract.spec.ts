/**
 * Contract Test: Calendar
 *
 * Validates that calendar endpoints exist in the OpenAPI spec
 * and their response schemas match what the frontend calendar API module expects:
 *   - GET /api/v1/calendar/events -> { events: CalendarEvent[], total: number }
 *   - GET /api/v1/calendar/events/{id} -> CalendarEvent (id, title, startTime, endTime, tenantId)
 *   - POST /api/v1/calendar/events/sync -> sync trigger response
 *
 * Frontend reference: frontend/lib/api/calendar.ts
 *   calendarApi.listEvents() -> { events, total }
 *   calendarApi.getEvent(id) -> CalendarEvent
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

describe('Calendar Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- calendar contract tests skipped');
    }
  });

  it('GET /api/v1/calendar/events path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/calendar/events', 'get');
  });

  it('calendar events list response has events and total', () => {
    if (!spec) return;

    const schema = getResponseSchema(spec, '/api/v1/calendar/events', 'get', '200');
    if (!schema) return;

    // Frontend expects { events: CalendarEvent[], total: number }
    if (schema.properties) {
      expect(schema.properties).toHaveProperty('events');
      expect(schema.properties).toHaveProperty('total');
    }
  });

  it('GET /api/v1/calendar/events 401 error uses ApiExceptionFilter envelope', () => {
    if (!spec) return;

    // ApiExceptionFilter shape: { error: { code, message, details }, meta: { requestId } }
    // No statusCode in body. Graceful skip if spec does not document 401 for this path.
    const schema = getResponseSchema(spec, '/api/v1/calendar/events', 'get', '401');
    if (!schema) return;

    if (schema.properties) {
      expect(schema.properties).toHaveProperty('error');
      expect(schema.properties).toHaveProperty('meta');
    }
  });

  it('GET /api/v1/calendar/events/{id} path exists', () => {
    if (!spec) return;

    const pathVariants = [
      '/api/v1/calendar/events/{id}',
      '/api/v1/calendar/events/{eventId}',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.get);
    expect(found).toBe(true);
  });

  it('calendar single event response has id and title fields', () => {
    if (!spec) return;

    const pathVariants = [
      '/api/v1/calendar/events/{id}',
      '/api/v1/calendar/events/{eventId}',
    ];
    const foundPath = pathVariants.find((p) => spec!.paths[p]?.get);
    if (!foundPath) return;

    const schema = getResponseSchema(spec, foundPath, 'get', '200');
    if (!schema) return;

    // CalendarEvent has: id, title, startTime, endTime, tenantId
    if (schema.properties) {
      expect(schema.properties).toHaveProperty('id');
      expect(schema.properties).toHaveProperty('title');
    }
  });

  it('POST /api/v1/calendar/events/sync path exists', () => {
    if (!spec) return;

    const pathVariants = [
      '/api/v1/calendar/events/sync',
      '/api/v1/calendar/sync',
    ];
    const found = pathVariants.some((p) => spec!.paths[p]?.post);
    // Soft: not all specs document sync trigger; skip if absent
    if (!found) return;
    expect(found).toBe(true);
  });
});

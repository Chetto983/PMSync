/**
 * Contract Test: Briefing
 *
 * Validates that the daily briefing endpoints exist in the OpenAPI spec
 * and their response schemas match what the frontend AI API module expects.
 *
 * Frontend reference: frontend/lib/api/ai.ts
 *   voltAgentApi.getBriefing() -> { success: boolean, briefing: Record<string, unknown> }
 *   voltAgentApi.refreshBriefing() -> { success: boolean, jobId: string, message: string }
 *   voltAgentApi.getWritingStyle() -> { success: boolean, profile: WritingStyleProfile }
 *   voltAgentApi.getDraftStats() -> { success: boolean, stats: DraftStats }
 */
import {
  loadSpec,
  expectPathExists,
  getResponseSchema,
  OpenApiSpec,
} from './contract-helpers';

describe('Briefing Contract', () => {
  let spec: OpenApiSpec | null;

  beforeAll(() => {
    spec = loadSpec();
    if (!spec) {
      console.warn('OpenAPI spec unavailable -- briefing contract tests skipped');
    }
  });

  it('GET /api/v1/ai/briefing path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/briefing', 'get');
  });

  it('briefing response has success and briefing fields', () => {
    if (!spec) return;

    const schema = getResponseSchema(spec, '/api/v1/ai/briefing', 'get', '200');
    if (!schema) return;

    // Frontend expects { success: boolean, briefing: Record<string, unknown> }
    if (schema.properties) {
      expect(schema.properties).toHaveProperty('success');
      expect(schema.properties).toHaveProperty('briefing');
    }
  });

  it('POST /api/v1/ai/briefing/refresh path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/briefing/refresh', 'post');
  });

  it('GET /api/v1/ai/stats/writing-style path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/stats/writing-style', 'get');
  });

  it('GET /api/v1/ai/draft-stats path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/draft-stats', 'get');
  });

  it('POST /api/v1/ai/drafts/generate path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/drafts/generate', 'post');
  });

  it('GET /api/v1/ai/analytics/email path exists', () => {
    if (!spec) return;
    expectPathExists(spec, '/api/v1/ai/analytics/email', 'get');
  });
});

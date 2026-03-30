/**
 * Response Envelope Validation (XCUT-03)
 *
 * Verifies that success and error responses follow the standard envelope format:
 * - Success: { data, meta: { requestId, timestamp } }
 * - Error: { error: { code, message }, meta: { requestId } }
 * - Correlation ID: X-Request-ID header matches meta.requestId
 */
import { BACKEND_URL } from './validation-helpers.mjs';

/**
 * Run response envelope validation checks.
 * @param {object} context - Playwright browser context
 * @param {string} cookieHeader - Cookie header string
 * @param {string} csrfToken - CSRF token
 * @returns {Array<{ name: string, status: string, detail: string }>}
 */
export async function validateResponseEnvelope(context, cookieHeader, csrfToken) {
  const results = [];
  const api = context.request;

  // XCUT-03a: Success response has { data, meta } shape
  try {
    const res = await api.get(BACKEND_URL + '/api/v1/emails?limit=1', {
      headers: { Cookie: cookieHeader },
    });
    const body = await res.json();

    const hasData = body.data !== undefined;
    const hasMeta = body.meta !== undefined;
    const hasRequestId = typeof body.meta?.requestId === 'string' && body.meta.requestId !== 'unknown';
    const hasTimestamp = typeof body.meta?.timestamp === 'string';

    if (hasData && hasMeta && hasRequestId && hasTimestamp) {
      results.push({
        name: 'XCUT-03a: Success response has { data, meta } shape',
        status: 'PASS',
        detail: `requestId=${body.meta.requestId.substring(0, 12)}..., timestamp=${body.meta.timestamp}`,
      });
    } else {
      const missing = [];
      if (!hasData) missing.push('data');
      if (!hasMeta) missing.push('meta');
      if (!hasRequestId) missing.push('meta.requestId');
      if (!hasTimestamp) missing.push('meta.timestamp');
      results.push({
        name: 'XCUT-03a: Success response has { data, meta } shape',
        status: 'FAIL',
        detail: `Missing fields: ${missing.join(', ')}. Body keys: ${Object.keys(body).join(', ')}`,
      });
    }
  } catch (err) {
    results.push({
      name: 'XCUT-03a: Success response has { data, meta } shape',
      status: 'FAIL',
      detail: err.message,
    });
  }

  // XCUT-03b: Success response X-Request-ID matches meta.requestId
  try {
    const res = await api.get(BACKEND_URL + '/api/v1/emails?limit=1', {
      headers: { Cookie: cookieHeader },
    });
    const headers = res.headers();
    const body = await res.json();

    const headerRequestId = headers['x-request-id'];
    const metaRequestId = body.meta?.requestId;

    if (headerRequestId && metaRequestId && headerRequestId === metaRequestId) {
      results.push({
        name: 'XCUT-03b: X-Request-ID header matches meta.requestId',
        status: 'PASS',
        detail: `Both equal: ${headerRequestId}`,
      });
    } else {
      results.push({
        name: 'XCUT-03b: X-Request-ID header matches meta.requestId',
        status: 'FAIL',
        detail: `Header: ${headerRequestId}, meta: ${metaRequestId}`,
      });
    }
  } catch (err) {
    results.push({
      name: 'XCUT-03b: X-Request-ID header matches meta.requestId',
      status: 'FAIL',
      detail: err.message,
    });
  }

  // XCUT-03c: Error response has { error, meta } shape (404)
  try {
    const res = await api.get(
      BACKEND_URL + '/api/v1/emails/00000000-0000-0000-0000-000000000000',
      { headers: { Cookie: cookieHeader } },
    );
    const status = res.status();
    const body = await res.json();

    const hasError = body.error !== undefined;
    const hasErrorCode = body.error?.code !== undefined;
    const hasErrorMessage = body.error?.message !== undefined;
    const hasMeta = body.meta !== undefined;
    const hasRequestId = typeof body.meta?.requestId === 'string';

    if (status >= 400 && hasError && hasErrorCode && hasErrorMessage && hasMeta && hasRequestId) {
      results.push({
        name: 'XCUT-03c: Error response has { error, meta } shape',
        status: 'PASS',
        detail: `HTTP ${status}, error.code=${body.error.code}, requestId=${body.meta.requestId.substring(0, 12)}...`,
      });
    } else {
      const missing = [];
      if (status < 400) missing.push(`unexpected status ${status}`);
      if (!hasError) missing.push('error');
      if (!hasErrorCode) missing.push('error.code');
      if (!hasErrorMessage) missing.push('error.message');
      if (!hasMeta) missing.push('meta');
      if (!hasRequestId) missing.push('meta.requestId');
      results.push({
        name: 'XCUT-03c: Error response has { error, meta } shape',
        status: 'FAIL',
        detail: `Missing: ${missing.join(', ')}. Status: ${status}`,
      });
    }
  } catch (err) {
    results.push({
      name: 'XCUT-03c: Error response has { error, meta } shape',
      status: 'FAIL',
      detail: err.message,
    });
  }

  // XCUT-03d: Validation error has { error, meta } shape
  try {
    const res = await api.post(BACKEND_URL + '/api/v1/emails/signatures', {
      headers: {
        Cookie: cookieHeader,
        'x-csrf-token': csrfToken,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    const status = res.status();
    const body = await res.json();

    if (status >= 400) {
      const hasError = body.error !== undefined;
      const hasMeta = body.meta !== undefined;
      const hasRequestId = typeof body.meta?.requestId === 'string';

      if (hasError && hasMeta && hasRequestId) {
        results.push({
          name: 'XCUT-03d: Validation error has { error, meta } shape',
          status: 'PASS',
          detail: `HTTP ${status}, error envelope present`,
        });
      } else {
        results.push({
          name: 'XCUT-03d: Validation error has { error, meta } shape',
          status: 'FAIL',
          detail: `HTTP ${status} but missing envelope fields. Body keys: ${Object.keys(body).join(', ')}`,
        });
      }
    } else {
      // If the empty body somehow succeeds, that's a different concern
      results.push({
        name: 'XCUT-03d: Validation error has { error, meta } shape',
        status: 'FAIL',
        detail: `Expected 4xx from empty POST /signatures, got ${status}`,
      });
    }
  } catch (err) {
    results.push({
      name: 'XCUT-03d: Validation error has { error, meta } shape',
      status: 'FAIL',
      detail: err.message,
    });
  }

  // XCUT-03e: Client-provided X-Request-ID is echoed
  try {
    const clientRequestId = 'test-correlation-122';
    const res = await api.get(BACKEND_URL + '/api/v1/emails?limit=1', {
      headers: {
        Cookie: cookieHeader,
        'X-Request-ID': clientRequestId,
      },
    });
    const headers = res.headers();
    const body = await res.json();

    const headerEchoed = headers['x-request-id'] === clientRequestId;
    const metaEchoed = body.meta?.requestId === clientRequestId;

    if (headerEchoed && metaEchoed) {
      results.push({
        name: 'XCUT-03e: Client-provided X-Request-ID is echoed',
        status: 'PASS',
        detail: `Header and meta both echo "${clientRequestId}"`,
      });
    } else {
      results.push({
        name: 'XCUT-03e: Client-provided X-Request-ID is echoed',
        status: 'FAIL',
        detail: `Header echoed: ${headerEchoed} (${headers['x-request-id']}), meta echoed: ${metaEchoed} (${body.meta?.requestId})`,
      });
    }
  } catch (err) {
    results.push({
      name: 'XCUT-03e: Client-provided X-Request-ID is echoed',
      status: 'FAIL',
      detail: err.message,
    });
  }

  return results;
}

/**
 * Unit tests for the attachment download proxy route.
 * Verifies the /api/v1 prefix fix (Phase 38) and auth logic.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Must import AFTER mocking fetch
import handler from './download';

function createMockReq(overrides: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: 'GET',
    query: { id: 'att-123' },
    cookies: { access_token: 'test-token-abc' },
    headers: {},
    ...overrides,
  } as unknown as NextApiRequest;
}

function createMockRes(): NextApiResponse & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
  _body: Buffer | null;
} {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    _body: null as Buffer | null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
      return res;
    },
    send(body: Buffer) {
      res._body = body;
      return res;
    },
  };
  return res as unknown as ReturnType<typeof createMockRes>;
}

beforeEach(() => {
  mockFetch.mockReset();
  // Set env for test
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
});

describe('attachment download proxy', () => {
  it('constructs backend URL with /api/v1 prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="test.pdf"',
        'content-length': '4',
      }),
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer),
    });

    const req = createMockReq({ query: { id: 'att-456' } });
    const res = createMockRes();

    await handler(req, res as unknown as NextApiResponse);

    // THE critical assertion: URL must include /api/v1
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/email/attachments/att-456/download');
    // Ensure it's not the OLD broken path without /api/v1
    expect(calledUrl).not.toMatch(/^\/email\/attachments\//);
    expect(mockFetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer test-token-abc' },
      }),
    );
    expect(res._status).toBe(200);
    expect(res._headers['content-type']).toBe('application/pdf');
  });

  it('rejects non-GET methods', async () => {
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();

    await handler(req, res as unknown as NextApiResponse);

    expect(res._status).toBe(405);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects missing attachment ID', async () => {
    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await handler(req, res as unknown as NextApiResponse);

    expect(res._status).toBe(400);
  });

  it('returns 401 when no token available', async () => {
    const req = createMockReq({ cookies: {}, headers: {} });
    const res = createMockRes();

    await handler(req, res as unknown as NextApiResponse);

    expect(res._status).toBe(401);
  });

  it('falls back to Authorization header when no cookie', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({}),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    const req = createMockReq({
      cookies: {},
      headers: { authorization: 'Bearer header-token-xyz' },
    });
    const res = createMockRes();

    await handler(req, res as unknown as NextApiResponse);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/email/attachments/'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer header-token-xyz' },
      }),
    );
  });

  it('forwards backend error status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Attachment not found'),
    });

    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res as unknown as NextApiResponse);

    expect(res._status).toBe(404);
  });
});

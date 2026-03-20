import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/auth/[...all]';

interface MockApiResponse {
  status: jest.MockedFunction<(statusCode: number) => MockApiResponse>;
  setHeader: jest.MockedFunction<(name: string, value: string) => void>;
  appendHeader: jest.MockedFunction<(name: string, value: string) => void>;
  send: jest.MockedFunction<(body: string) => void>;
  end: jest.MockedFunction<() => void>;
  json: jest.MockedFunction<(body: unknown) => void>;
}

type MockApiRequest = NextApiRequest & AsyncIterable<Uint8Array>;

function createAsyncIterator(): AsyncGenerator<Uint8Array> {
  return (async function* emptyIterator() {})();
}

describe('auth proxy handler', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalEnv;
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  function createResponseMock() {
    const res: MockApiResponse = {
      status: jest.fn(),
      setHeader: jest.fn(),
      appendHeader: jest.fn(),
      send: jest.fn(),
      end: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  }

  it('preserves multiple set-cookie headers and strips backend domain', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://backend.example.com';

    const headers = new Headers({
      'content-type': 'application/json',
    });
    const response = {
      status: 200,
      headers: Object.assign(headers, {
        getSetCookie: () => [
          'better-auth.session=abc; Path=/; Domain=backend.example.com; HttpOnly',
          'better-auth.state=xyz; Path=/; Domain=backend.example.com; HttpOnly',
        ],
      }),
      body: {},
      text: jest.fn().mockResolvedValue('{"ok":true}'),
    } as unknown as Response;

    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const req = {
      method: 'GET',
      query: { all: ['callback', 'google'], state: 'opaque-state' },
      headers: { cookie: 'existing=1' },
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: createAsyncIterator,
    } as unknown as MockApiRequest;
    const res = createResponseMock();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.appendHeader).toHaveBeenNthCalledWith(
      1,
      'set-cookie',
      'better-auth.session=abc; Path=/; HttpOnly',
    );
    expect(res.appendHeader).toHaveBeenNthCalledWith(
      2,
      'set-cookie',
      'better-auth.state=xyz; Path=/; HttpOnly',
    );
    expect(res.send).toHaveBeenCalledWith('{"ok":true}');
  });

  it('rewrites backend auth redirects to the frontend proxy path', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://backend.example.com';

    const headers = new Headers({
      location: 'https://backend.example.com/api/auth/callback/google?code=abc&state=def',
    });
    const response = {
      status: 302,
      headers,
      body: null,
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response;

    global.fetch = jest.fn().mockResolvedValue(response) as unknown as typeof fetch;

    const req = {
      method: 'GET',
      query: { all: ['sign-in', 'social'] },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: createAsyncIterator,
    } as unknown as MockApiRequest;
    const res = createResponseMock();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.setHeader).toHaveBeenCalledWith(
      'location',
      '/api/auth/callback/google?code=abc&state=def',
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('does not log secret-bearing URLs on proxy error', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://backend.example.com';

    const secretUrl =
      'https://backend.example.com/api/auth/callback/google?code=SECRET_AUTH_CODE&state=SECRET_STATE';
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const req = {
      method: 'GET',
      query: { all: ['callback', 'google'], code: 'SECRET_AUTH_CODE', state: 'SECRET_STATE' },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: createAsyncIterator,
    } as unknown as MockApiRequest;
    const res = createResponseMock();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ error: 'Auth proxy error' });

    for (const call of consoleErrorSpy.mock.calls) {
      const logged = call.join(' ');
      expect(logged).not.toContain('SECRET_AUTH_CODE');
      expect(logged).not.toContain('SECRET_STATE');
      expect(logged).not.toContain(secretUrl);
    }
  });

  it('does not log OAuth codes, tokens, or verification tokens', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://backend.example.com';

    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;

    const req = {
      method: 'GET',
      query: {
        all: ['verify-email'],
        token: 'VERIFICATION_TOKEN_SECRET',
        callbackURL: 'https://example.com/dashboard',
      },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      [Symbol.asyncIterator]: createAsyncIterator,
    } as unknown as MockApiRequest;
    const res = createResponseMock();

    await handler(req, res as unknown as NextApiResponse);

    for (const call of consoleErrorSpy.mock.calls) {
      const logged = call.join(' ');
      expect(logged).not.toContain('VERIFICATION_TOKEN_SECRET');
    }
  });
});

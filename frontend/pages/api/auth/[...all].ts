import type { NextApiRequest, NextApiResponse } from 'next';
import { BACKEND_ORIGIN } from '@/lib/backend-origin';

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function buildTargetUrl(req: NextApiRequest, backendUrl: string): string {
  const slugParts = Array.isArray(req.query.all) ? req.query.all : [req.query.all];
  const pathname = slugParts.filter(Boolean).join('/');
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'all') {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => queryParams.append(key, entry));
      continue;
    }

    if (value) {
      queryParams.append(key, value);
    }
  }

  const queryString = queryParams.toString();
  return `${backendUrl}/api/auth/${pathname}${queryString ? `?${queryString}` : ''}`;
}

async function readRequestBody(req: NextApiRequest): Promise<Uint8Array | undefined> {
  if (!req.method || ['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? new Uint8Array(Buffer.concat(chunks)) : undefined;
}

function copyRequestHeaders(
  req: NextApiRequest,
  backendUrl: string,
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase();

    if (!value || hopByHopHeaders.has(lowerKey) || lowerKey === 'host') {
      continue;
    }

    if (typeof value === 'string') {
      headers[key] = value;
      continue;
    }

    headers[key] = value.join(', ');
  }

  headers.host = new URL(backendUrl).host;
  headers['x-forwarded-for'] =
    (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';

  // Ensure Origin header is set on state-changing requests forwarded to backend.
  // Same-origin requests (browser → Next.js proxy) may omit Origin,
  // but the backend's better-auth CSRF protection requires it on POST.
  // Use the frontend's own origin (always in backend's trustedOrigins).
  if (!headers.origin && req.method && !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    const forwardedHost = req.headers['x-forwarded-host'] as string | undefined;
    const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
    const host = forwardedHost || req.headers.host || 'localhost:3001';
    headers.origin = `${proto}://${host}`;
  }

  return headers;
}

export function getSetCookies(response: Response): string[] {
  const headersWithGetSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === 'function') {
    return headersWithGetSetCookie.getSetCookie();
  }

  const setCookie = response.headers.get('set-cookie');
  return setCookie ? [setCookie] : [];
}

function rewriteAuthLocation(value: string, backendUrl: string): string {
  if (!value.startsWith(`${backendUrl}/api/auth/`)) {
    return value;
  }

  return value.replace(`${backendUrl}/api/auth/`, '/api/auth/');
}

/**
 * Provider-link state prefix.
 * Custom provider-link OAuth flows use state tokens prefixed with 'pl_'
 * to distinguish them from better-auth social login callbacks.
 * When detected, the proxy redirects to Settings with the authorization code
 * instead of forwarding to better-auth.
 */
const PROVIDER_LINK_STATE_PREFIX = 'pl_';

/**
 * Map callback path segment → provider name for provider-link interception.
 */
const CALLBACK_PROVIDER_MAP: Record<string, string> = {
  google: 'google',
  microsoft: 'microsoft',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendUrl = BACKEND_ORIGIN;

  // --- Provider-link callback interception ---
  // OAuth callbacks hit /api/auth/callback/{provider}?code=...&state=pl_...
  // If state starts with 'pl_', this is a provider-link flow (not better-auth login).
  // Redirect to Settings page which exchanges the code via the providers API.
  const slugParts = Array.isArray(req.query.all) ? req.query.all : [req.query.all];
  if (
    req.method === 'GET' &&
    slugParts.length === 2 &&
    slugParts[0] === 'callback' &&
    typeof slugParts[1] === 'string' &&
    CALLBACK_PROVIDER_MAP[slugParts[1]]
  ) {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (state.startsWith(PROVIDER_LINK_STATE_PREFIX)) {
      const provider = CALLBACK_PROVIDER_MAP[slugParts[1]];
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const error = typeof req.query.error === 'string' ? req.query.error : '';

      if (error) {
        const errorDesc = typeof req.query.error_description === 'string'
          ? req.query.error_description
          : error;
        res.redirect(
          `/dashboard/settings?section=accounts&error=${encodeURIComponent(errorDesc)}&provider=${provider}`,
        );
        return;
      }

      if (!code) {
        res.redirect(
          `/dashboard/settings?section=accounts&error=no_code&provider=${provider}`,
        );
        return;
      }

      res.redirect(
        `/dashboard/settings?section=accounts&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}&provider=${provider}`,
      );
      return;
    }
  }

  try {
    const targetUrl = buildTargetUrl(req, backendUrl);
    const headers = copyRequestHeaders(req, backendUrl);
    const body = await readRequestBody(req);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body as BodyInit | undefined,
      redirect: 'manual',
    });

    res.status(response.status);

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();

      if (hopByHopHeaders.has(lowerKey) || lowerKey === 'set-cookie') {
        return;
      }

      if (lowerKey === 'location') {
        res.setHeader(key, rewriteAuthLocation(value, backendUrl));
        return;
      }

      res.setHeader(key, value);
    });

    const setCookies = getSetCookies(response);
    setCookies.forEach((cookie) => {
      res.appendHeader('set-cookie', cookie.replace(/;\s*domain=[^;]*/gi, ''));
    });

    if (!response.body || req.method === 'HEAD' || [204, 205, 304].includes(response.status)) {
      res.end();
      return;
    }

    const responseText = await response.text();
    res.send(responseText);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Never log full URLs — they may contain OAuth codes, state values, or tokens
    // eslint-disable-next-line no-console
    console.error(`[auth-proxy] proxy error: ${message}`);
    res.status(502).json({ error: 'Auth proxy error' });
  }
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
    responseLimit: false,
  },
};

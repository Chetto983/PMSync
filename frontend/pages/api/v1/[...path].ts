import type { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const backendOrigin =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '');

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

function buildTargetUrl(req: NextApiRequest): string {
  const pathParts = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
  const pathname = pathParts.filter(Boolean).join('/');
  const queryParams = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') {
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
  return `${backendOrigin}/api/v1/${pathname}${queryString ? `?${queryString}` : ''}`;
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

function copyRequestHeaders(req: NextApiRequest): Record<string, string> {
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

  headers.host = new URL(backendOrigin).host;
  headers['x-forwarded-for'] =
    (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';

  return headers;
}

function getSetCookies(response: Response): string[] {
  const headersWithGetSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === 'function') {
    return headersWithGetSetCookie.getSetCookie();
  }

  const setCookie = response.headers.get('set-cookie');
  return setCookie ? [setCookie] : [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!backendOrigin) {
    return res.status(500).json({ error: 'NEXT_PUBLIC_API_URL is not configured' });
  }

  try {
    const targetUrl = buildTargetUrl(req);
    const headers = copyRequestHeaders(req);
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

    await pipeline(Readable.fromWeb(response.body as never), res);
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'API proxy error',
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
    responseLimit: false,
  },
  // SSE streams (ai/chat) can run 60s+ during tool loops.
  // Default Vercel timeout (10s hobby / 60s pro) kills the stream mid-flight,
  // leaving assistant-ui stuck with data-status="running" forever.
  maxDuration: 300,
};

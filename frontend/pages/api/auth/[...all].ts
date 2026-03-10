import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Proxy all /api/auth/* requests to the backend better-auth instance.
 *
 * WHY: better-auth stores OAuth state in HTTP-only cookies. When the frontend
 * (Vercel) and backend (Railway) are on different domains, browsers block
 * Set-Cookie as third-party. By proxying through the frontend, cookies are
 * set on the same origin and the OAuth state flow works correctly.
 */
export const config = {
  api: {
    bodyParser: true,
    externalResolver: true,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  // Reconstruct the path: /api/auth/signin/social -> /api/auth/signin/social
  const slugParts = req.query.all;
  const subPath = Array.isArray(slugParts) ? slugParts.join('/') : slugParts || '';
  const targetUrl = `${backendUrl}/api/auth/${subPath}`;

  try {
    // Forward headers, including cookies
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (value && typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }
    // Override host to match backend
    headers['host'] = new URL(backendUrl).host;
    // Forward real client IP
    headers['x-forwarded-for'] =
      (req.headers['x-forwarded-for'] as string) ||
      req.socket.remoteAddress ||
      '';

    // Build fetch options
    const fetchOptions: RequestInit = {
      method: req.method || 'GET',
      headers,
      redirect: 'manual', // Don't follow redirects — pass them to client
    };

    // Forward body for non-GET requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
      headers['content-type'] = 'application/json';
    }

    const response = await fetch(targetUrl, fetchOptions);

    // Forward status
    res.status(response.status);

    // Forward all response headers (especially Set-Cookie for auth state)
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();

      // Skip hop-by-hop headers
      if (['transfer-encoding', 'connection', 'keep-alive'].includes(lowerKey)) {
        return;
      }

      if (lowerKey === 'set-cookie') {
        // Append each Set-Cookie header individually
        res.appendHeader('set-cookie', value);
      } else if (lowerKey === 'location') {
        // Rewrite redirects: if backend redirects to its own /api/auth/*,
        // rewrite to our frontend proxy path
        const redirectUrl = value;
        if (redirectUrl.startsWith(backendUrl + '/api/auth/')) {
          const rewritten = redirectUrl.replace(
            backendUrl + '/api/auth/',
            '/api/auth/',
          );
          res.setHeader('location', rewritten);
        } else {
          res.setHeader('location', redirectUrl);
        }
      } else {
        res.setHeader(key, value);
      }
    });

    // Forward body
    if (response.status === 204 || response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      res.end();
    } else {
      const body = await response.text();
      res.send(body);
    }
  } catch (error) {
    console.error('[auth-proxy] Error proxying to backend:', error);
    res.status(502).json({ error: 'Auth proxy error' });
  }
}

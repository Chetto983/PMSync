/**
 * Attachment Download Proxy Route
 *
 * Proxies attachment download requests from frontend to backend,
 * adding authentication headers that can't be sent via img src attributes.
 *
 * Flow:
 * 1. img src="/api/email/attachments/{id}/download" (frontend route)
 * 2. This route reads auth token from cookie/localStorage
 * 3. Forwards request to backend: http://localhost:3000/api/v1/email/attachments/{id}/download
 * 4. Streams response back to client with proper headers
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// CRITICAL: Only fallback to localhost in development mode
// In production, NEXT_PUBLIC_API_URL must be set via Vercel environment variables
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing attachment ID' });
  }

  // Get auth token from httpOnly access_token cookie (set by backend on login).
  // Next.js API routes run server-side and CAN read httpOnly cookies.
  let token: string | undefined;

  // Primary: read from httpOnly access_token cookie (Phase 34 cookie auth)
  if (req.cookies['access_token']) {
    token = req.cookies['access_token'];
  }

  // Fallback: Authorization header (for authenticated fetch requests)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Forward request to backend with auth
    // Backend route: /api/v1/email/attachments/:id/download
    const backendUrl = `${API_BASE_URL}/api/v1/email/attachments/${id}/download`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Forward error status and message from backend
      const errorText = await response.text();
      return res.status(response.status).json({
        error: errorText || `Backend error: ${response.status}`,
      });
    }

    // Copy response headers for streaming
    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    const contentLength = response.headers.get('content-length');

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    }
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Add cache headers for inline images (cache for 1 hour)
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Stream response body to client
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to download attachment',
    });
  }
}

// Disable body parsing for streaming
export const config = {
  api: {
    responseLimit: '50mb',
  },
};

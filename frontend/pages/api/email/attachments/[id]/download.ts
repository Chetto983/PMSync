/**
 * Attachment Download Proxy Route
 *
 * Proxies attachment download requests from frontend to backend,
 * adding authentication headers that can't be sent via img src attributes.
 *
 * Flow:
 * 1. img src="/api/email/attachments/{id}/download" (frontend route)
 * 2. This route reads auth token from cookie/localStorage
 * 3. Forwards request to backend: http://localhost:3000/email/attachments/{id}/download
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

  // Get auth token from Authorization header or cookie
  let token: string | undefined;

  // Check Authorization header first (for authenticated fetch requests)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Read from auth-token cookie (set by auth-store for img src authentication)
  if (!token && req.cookies['auth-token']) {
    token = decodeURIComponent(req.cookies['auth-token']);
  }

  // Fall back to reading from auth-storage cookie (legacy)
  if (!token && req.cookies['auth-storage']) {
    try {
      const parsed = JSON.parse(req.cookies['auth-storage']);
      token = parsed?.state?.token;
    } catch {
      // Invalid JSON, skip
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Forward request to backend with auth
    // Backend route: /email/attachments/:id/download (no api/v1 prefix)
    const backendUrl = `${API_BASE_URL}/email/attachments/${id}/download`;

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

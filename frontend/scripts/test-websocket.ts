/**
 * Standalone WebSocket Connection Test
 *
 * Tests the full realtime auth flow:
 * 1. Sign in via Better Auth to get session cookie
 * 2. Request realtime auth token
 * 3. Connect to /realtime namespace via socket.io-client
 * 4. Verify "connected" event with user data
 *
 * Run: npx tsx scripts/test-websocket.ts
 *
 * Environment variables:
 *   E2E_API_URL       - Backend URL (default: http://localhost:3100)
 *   E2E_USER_EMAIL    - Test user email (default: admin@pmsync.local)
 *   E2E_USER_PASSWORD - Test user password (default: TestPassword123!)
 *   E2E_FRONTEND_URL  - Frontend origin for CSRF (default: http://localhost:3001)
 */

import { io } from 'socket.io-client';

const apiURL = process.env.E2E_API_URL ?? 'http://localhost:3100';
const userEmail = process.env.E2E_USER_EMAIL ?? 'admin@pmsync.local';
const userPassword = process.env.E2E_USER_PASSWORD ?? 'TestPassword123!';
const frontendOrigin = process.env.E2E_FRONTEND_URL ?? 'http://localhost:3001';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Extract all Set-Cookie values from response headers.
 * fetch() merges multiple Set-Cookie into one comma-separated string,
 * but cookies can contain commas in dates so we parse carefully.
 */
function extractCookies(response: Response): string {
  const cookies: string[] = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      // Split on comma that is NOT inside a date pattern (e.g. "Thu, 20 Mar")
      // Simpler: each Set-Cookie header value is one cookie
      cookies.push(value);
    }
  });

  // Browsers and fetch merge Set-Cookie headers. Parse out cookie name=value pairs.
  const rawHeader = response.headers.get('set-cookie') ?? '';
  if (!rawHeader) return '';

  // Extract just name=value from each cookie (before first semicolon)
  const parts: string[] = [];
  // Split on ", " followed by a cookie name pattern (word=) to handle merged headers
  const segments = rawHeader.split(/,\s*(?=[a-zA-Z_\-.]+=)/);
  for (const segment of segments) {
    const nameValue = segment.split(';')[0].trim();
    if (nameValue.includes('=')) {
      parts.push(nameValue);
    }
  }

  return parts.join('; ');
}

(async () => {
  try {
    console.log(`[WS-TEST] Backend URL: ${apiURL}`);
    console.log(`[WS-TEST] User: ${userEmail}`);

    // Step 1: Sign in via Better Auth
    console.log('[WS-TEST] Step 1: Signing in...');
    const signInResponse = await fetch(`${apiURL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: frontendOrigin,
        Referer: `${frontendOrigin}/auth/login`,
      },
      body: JSON.stringify({ email: userEmail, password: userPassword }),
      redirect: 'manual',
    });

    if (!signInResponse.ok && signInResponse.status !== 302) {
      const errorText = await signInResponse.text();
      throw new Error(
        `Sign-in failed with status ${signInResponse.status}: ${errorText}`,
      );
    }

    const sessionCookie = extractCookies(signInResponse);
    assert(sessionCookie.length > 0, 'No session cookie received from sign-in');
    console.log(`[WS-TEST] Sign-in successful, got session cookie`);

    // Step 2: Request realtime auth token
    console.log('[WS-TEST] Step 2: Requesting realtime auth token...');
    const tokenResponse = await fetch(`${apiURL}/api/v1/realtime/auth-token`, {
      method: 'GET',
      headers: {
        Cookie: sessionCookie,
        Origin: frontendOrigin,
      },
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Auth token request failed with status ${tokenResponse.status}: ${errorText}`,
      );
    }

    const tokenBody = await tokenResponse.json();
    // Handle response envelope { data, meta } if present
    const tokenData =
      tokenBody && typeof tokenBody === 'object' && 'data' in tokenBody
        ? tokenBody.data
        : tokenBody;

    const { token, expiresAt } = tokenData as {
      token: string;
      expiresAt: string;
    };

    assert(typeof token === 'string' && token.length > 0, 'Token is empty');
    assert(
      token.startsWith('pmsync.ws.'),
      `Token should start with "pmsync.ws.", got: ${token.substring(0, 20)}...`,
    );
    assert(!!expiresAt, 'expiresAt is missing');
    console.log(`[WS-TEST] Got realtime token (expires: ${expiresAt})`);

    // Step 3: Connect via Socket.IO
    console.log('[WS-TEST] Step 3: Connecting WebSocket...');
    const socket = io(`${apiURL}/realtime`, {
      auth: { token },
      transports: ['websocket'],
      extraHeaders: {
        Origin: frontendOrigin,
      },
    });

    // Step 4: Wait for "connected" event
    const connectedData = await Promise.race<Record<string, unknown>>([
      new Promise<Record<string, unknown>>((resolve) => {
        socket.on('connected', (data: Record<string, unknown>) => {
          resolve(data);
        });
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: "connected" event not received within 10s')), 10_000),
      ),
    ]);

    console.log('[WS-TEST] Step 4: Received "connected" event');

    assert(
      typeof connectedData.userId === 'string' && connectedData.userId.length > 0,
      `userId should be a non-empty string, got: ${connectedData.userId}`,
    );
    assert(
      typeof connectedData.tenantId === 'string' && connectedData.tenantId.length > 0,
      `tenantId should be a non-empty string, got: ${connectedData.tenantId}`,
    );
    assert(
      typeof connectedData.email === 'string' && connectedData.email.length > 0,
      `email should be a non-empty string, got: ${connectedData.email}`,
    );
    assert(!!connectedData.timestamp, 'timestamp should be truthy');

    console.log(
      `[WS-TEST] Connected as: ${connectedData.email} (userId: ${connectedData.userId}, tenantId: ${connectedData.tenantId})`,
    );

    // Step 5: Disconnect cleanly
    socket.disconnect();
    console.log('[WS-TEST] Disconnected cleanly');

    console.log('[WS-TEST] WebSocket test PASSED');
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[WS-TEST] FAILED: ${message}`);
    process.exit(1);
  }
})();

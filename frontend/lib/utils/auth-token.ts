/**
 * DEPRECATED: Auth now uses httpOnly cookies set by the backend.
 *
 * This stub exists so that any remaining import sites don't crash.
 * It always returns an empty string. The httpOnly cookie is sent
 * automatically by the browser via `withCredentials: true` / `credentials: 'include'`.
 *
 * TODO: Remove this file once all callers are confirmed migrated.
 */
export function getAuthToken(): string {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[DEPRECATED] getAuthToken() is deprecated. Auth uses httpOnly cookies now.');
  }
  return '';
}

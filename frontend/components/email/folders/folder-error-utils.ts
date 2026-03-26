/**
 * T-0905: Extract FolderOperationError code from API error responses.
 *
 * Backend returns structured errors via BadRequestException:
 * { statusCode: 400, message: { error: 'FolderOperationError', code: '...', ... } }
 *
 * Axios/fetch wraps these, so we dig through several shapes.
 */

type FolderErrorCode =
  | 'not-found'
  | 'permission-denied'
  | 'server-error'
  | 'timeout'
  | 'has-children'
  | 'unsupported'
  | 'circuit-breaker'
  | 'name-invalid'
  | 'already-exists';

/**
 * Try to extract a FolderOperationError code from an unknown error.
 * Returns the code string if found, or null if this is not a folder error.
 */
export function extractFolderErrorCode(error: unknown): FolderErrorCode | null {
  if (!error || typeof error !== 'object') return null;

  // Shape 1: error.response.data.message (axios-style)
  const axiosData = (error as any)?.response?.data;
  const code = extractCodeFromPayload(axiosData);
  if (code) return code;

  // Shape 2: error.data (TanStack Query wraps the response body)
  const directData = (error as any)?.data;
  const code2 = extractCodeFromPayload(directData);
  if (code2) return code2;

  // Shape 3: error.message is JSON string (some API clients)
  try {
    const msgStr = (error as any)?.message;
    if (typeof msgStr === 'string' && msgStr.startsWith('{')) {
      const parsed = JSON.parse(msgStr);
      const code3 = extractCodeFromPayload(parsed);
      if (code3) return code3;
    }
  } catch {
    // Not JSON, ignore
  }

  return null;
}

function extractCodeFromPayload(payload: unknown): FolderErrorCode | null {
  if (!payload || typeof payload !== 'object') return null;

  // NestJS BadRequestException wraps our toJSON() in `message`
  const message = (payload as any).message;

  // message could be the FolderOperationError JSON directly
  if (message && typeof message === 'object' && message.error === 'FolderOperationError') {
    return message.code as FolderErrorCode;
  }

  // Or the payload itself is the FolderOperationError JSON
  if ((payload as any).error === 'FolderOperationError') {
    return (payload as any).code as FolderErrorCode;
  }

  return null;
}

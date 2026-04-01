const PRODUCTION_BACKEND_ORIGIN = 'https://backend-production-78e1.up.railway.app';

export function resolveBackendOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BACKEND_API_URL ||
    (process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : PRODUCTION_BACKEND_ORIGIN)
  );
}

export const BACKEND_ORIGIN = resolveBackendOrigin();

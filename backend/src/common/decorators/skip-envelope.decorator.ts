import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/**
 * Marks a handler or controller to bypass the ResponseEnvelopeInterceptor.
 * Use on streaming endpoints (SSE, WebSocket) or endpoints that manage their own response shape.
 */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);

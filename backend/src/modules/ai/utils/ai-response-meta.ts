export type AiResponseSource = 'live' | 'cache' | 'fallback';
export type AiResponseStatus = 'ok' | 'degraded';

export interface AiResponseMeta {
  operation: string;
  version: string;
  source: AiResponseSource;
  status: AiResponseStatus;
  generatedAt: string;
  locale?: string;
  model?: string;
  warnings?: string[];
}

export interface AiServiceResult<T> {
  data: T;
  meta: AiResponseMeta;
  error?: string;
}

interface BuildAiResponseMetaInput {
  operation: string;
  version: string;
  source: AiResponseSource;
  generatedAt?: Date | string;
  locale?: string;
  model?: string;
  warnings?: string[];
  degraded?: boolean;
}

export function buildAiResponseMeta({
  operation,
  version,
  source,
  generatedAt = new Date(),
  locale,
  model,
  warnings,
  degraded = false,
}: BuildAiResponseMetaInput): AiResponseMeta {
  return {
    operation,
    version,
    source,
    status: degraded ? 'degraded' : 'ok',
    generatedAt:
      generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    ...(locale ? { locale } : {}),
    ...(model ? { model } : {}),
    ...(warnings?.length ? { warnings } : {}),
  };
}

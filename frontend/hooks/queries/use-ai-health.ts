import { useQuery } from '@tanstack/react-query';
import { aiChatApi } from '@/lib/api/ai';

export type AiHealthStatus = 'ok' | 'degraded' | 'unhealthy';

/**
 * Polls the public AI health endpoint every 30s.
 * Returns the current AI service status for degraded-mode UI (OBS-M3).
 */
export function useAiHealth() {
  return useQuery({
    queryKey: ['ai', 'health'],
    queryFn: async () => {
      const { data } = await aiChatApi.getHealth();
      return data.status;
    },
    staleTime: 30_000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}

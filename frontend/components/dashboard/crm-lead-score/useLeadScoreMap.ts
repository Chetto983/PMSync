import { useMemo } from 'react';
import { useLeadScores } from '@/hooks/queries';
import type { LeadScoreEntry } from '@/components/contacts/ContactList';

/**
 * Fetches all lead scores and returns a Map<contactId, LeadScoreEntry>
 * for efficient lookup in contact lists.
 */
export function useLeadScoreMap(): Map<string, LeadScoreEntry> {
  const { data } = useLeadScores({ pageSize: 500 });

  return useMemo(() => {
    const map = new Map<string, LeadScoreEntry>();
    if (!data?.data) return map;
    for (const item of data.data) {
      map.set(item.contactId, { score: item.score, tier: item.tier });
    }
    return map;
  }, [data?.data]);
}

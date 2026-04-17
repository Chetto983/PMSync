/**
 * TodayFeedList — Renders the three urgency tier sections in order.
 *
 * Filters out client-dismissed item IDs from the Zustand store.
 * Wraps each row in framer-motion's AnimatePresence for slide-out exit
 * animations per UI-SPEC § Animations (200ms, cubic-bezier(0.4,0,0.2,1)).
 *
 * Per RESEARCH Pitfall 6 + a11y SKILL: outer container uses role="list" so
 * MUI/framer-motion structural changes don't strip semantics.
 */

'use client';

import { Box } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import { useTodayFeedStore } from '@/stores/today-feed-store';
import type { TodayFeedItem, TodayFeedCounts, TodayTier } from '@/lib/api/dashboard';
import { TodayTierSection } from './TodayTierSection';
import { TodayFeedItem as Row } from './TodayFeedItem';

interface TodayFeedListProps {
  items: TodayFeedItem[];
  counts: TodayFeedCounts;
}

const TIER_ORDER: TodayTier[] = ['urgent', 'today', 'fyi'];

export function TodayFeedList({ items }: TodayFeedListProps) {
  const dismissedIds = useTodayFeedStore((s) => s.dismissedIds);
  const visible = items.filter((i) => !dismissedIds.has(i.id));

  const byTier: Record<TodayTier, TodayFeedItem[]> = { urgent: [], today: [], fyi: [] };
  for (const it of visible) byTier[it.tier].push(it);

  return (
    <Box role="list" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {TIER_ORDER.map((tier) => {
        const tierItems = byTier[tier];
        if (tierItems.length === 0) return null;
        return (
          <TodayTierSection key={tier} tier={tier} count={tierItems.length}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <AnimatePresence initial={false}>
                {tierItems.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <Row item={item} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </Box>
          </TodayTierSection>
        );
      })}
    </Box>
  );
}

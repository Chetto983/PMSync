/**
 * TodayStream — Sticky collapsible header + accessible list container (145.1-04).
 *
 * Composes the 4-stream taxonomy: sticky header with chevron toggle, keyboard-
 * activatable with aria-expanded/aria-controls, and a collapsible body where
 * `role="list"` is on a Box that is a SIBLING (not parent) of AnimatePresence —
 * this is the WR-03 fix: AnimatePresence + motion.div inject DOM wrappers that
 * were breaking role="list" → role="listitem" direct-child semantics.
 *
 * Empty streams render null (D-02). Collapse state flows through the Zustand
 * store via `isToggled` / `toggleStream` (flip-from-default semantics per Plan
 * 02). Every animated surface has a `prefers-reduced-motion` fallback per
 * UI-SPEC §Accessibility line 221:
 *   - Collapse timeout → 0
 *   - AnimatePresence mode → 'wait' (no overlapping exit/enter)
 *   - motion.div transition duration → 0, layout → false
 *   - Chevron rotation → transition:none via @media (reduce)
 */

'use client';

import type { KeyboardEvent } from 'react';
import { Box, Collapse, Skeleton, Stack, Typography } from '@mui/material';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Mail, CheckSquare, Users, Info, type LucideIcon } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { TodayFeedItem, TodayStream as StreamName } from '@/lib/api/dashboard';
import { useTodayFeedStore } from '@/stores/today-feed-store';
import { TodayRow } from './TodayRow';

const STREAM_ICON: Record<StreamName, LucideIcon> = {
  'replies-needed': Mail,
  'due-today': CheckSquare,
  'waiting-on-others': Users,
  'fyi': Info,
};

const STREAM_LABEL_KEY: Record<StreamName, 'repliesNeeded' | 'dueToday' | 'waitingOnOthers' | 'fyi'> = {
  'replies-needed': 'repliesNeeded',
  'due-today': 'dueToday',
  'waiting-on-others': 'waitingOnOthers',
  'fyi': 'fyi',
};

interface Props {
  name: StreamName;
  items: TodayFeedItem[];
  defaultExpanded: boolean;
  loading?: boolean;
}

export function TodayStream({ name, items, defaultExpanded, loading }: Props) {
  const t = useTranslations();
  const reducedMotion = useReducedMotion();
  // Store semantics (per Plan 02 Task 4): `toggledStreams` is the set of streams
  // whose expansion state has been FLIPPED from defaultExpanded. `isToggled`
  // returns true when the user has touched this stream in the current session.
  const storeToggled = useTodayFeedStore((s) => s.isToggled(name));
  const toggleStream = useTodayFeedStore((s) => s.toggleStream);
  // storeToggled === true means user flipped away from default.
  const expanded = storeToggled ? !defaultExpanded : defaultExpanded;
  const Icon = STREAM_ICON[name];
  const labelKey = STREAM_LABEL_KEY[name];

  // Hide entirely when not loading and empty (D-02 rule).
  if (!loading && items.length === 0) return null;

  const handleToggle = () => toggleStream(name);
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <Box>
      {/* Sticky header — clickable and keyboard-activatable */}
      <Stack
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={`stream-${name}-body`}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
          py: 1,
          px: 2,
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: '1px solid',
          borderColor: 'divider',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        <Icon size={14} aria-hidden />
        <Typography
          variant="overline"
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: 'text.secondary',
          }}
        >
          {t.dashboard.today.stream[labelKey]} · {loading ? '—' : items.length}
        </Typography>
        <Box flex={1} />
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 150ms ease-out',
            // Reduced-motion fallback per UI-SPEC §Accessibility line 221.
            '@media (prefers-reduced-motion: reduce)': {
              transition: 'none',
            },
          }}
        >
          <ChevronDown size={16} aria-hidden />
        </Box>
      </Stack>

      {/* role="list" is on a Box that is a SIBLING (not a parent) of AnimatePresence.
          This fixes WR-03: AnimatePresence+motion.div injects wrappers that were
          breaking role="list" → role="listitem" direct-child semantics. */}
      <Collapse in={expanded} timeout={reducedMotion ? 0 : 200}>
        <Box id={`stream-${name}-body`} role="list">
          {loading ? (
            <>
              <Skeleton variant="rectangular" height={40} sx={{ my: 0.5 }} />
              <Skeleton variant="rectangular" height={40} sx={{ my: 0.5 }} />
              <Skeleton variant="rectangular" height={40} sx={{ my: 0.5 }} />
            </>
          ) : (
            <AnimatePresence initial={false} mode={reducedMotion ? 'wait' : 'popLayout'}>
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout={!reducedMotion}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.15, ease: [0.4, 0, 0.2, 1] }}
                >
                  <TodayRow item={item} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

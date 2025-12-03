/**
 * EnhancedThreadListSkeleton Component
 *
 * Modern skeleton loader for email lists with:
 * - Smooth wave animation
 * - Staggered appearance
 * - Accurate layout matching
 * - Accessibility support
 */
import React from 'react';
import { Box, Skeleton, Divider } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

interface EnhancedThreadListSkeletonProps {
  /** Number of skeleton items to show */
  count?: number;
  /** Whether to show checkbox skeleton */
  showCheckbox?: boolean;
  /** Whether to show labels skeleton */
  showLabels?: boolean;
  /** Animation style */
  animation?: 'pulse' | 'wave' | false;
}

// Pre-computed widths for skeleton variation (deterministic)
const FROM_WIDTHS = ['25%', '30%', '35%', '28%', '32%', '27%', '33%', '29%'];
const SUBJECT_WIDTHS = ['55%', '65%', '60%', '70%', '58%', '68%', '62%', '72%'];
const SNIPPET_WIDTHS = ['75%', '85%', '80%', '90%', '78%', '88%', '82%', '92%'];

/**
 * Single skeleton item matching ThreadListItem layout
 */
const SkeletonItem: React.FC<{
  index: number;
  showCheckbox: boolean;
  showLabels: boolean;
  animation: 'pulse' | 'wave' | false;
}> = ({ index, showCheckbox, showLabels, animation }) => {
  // Use index-based widths for variation (deterministic)
  const fromWidth = FROM_WIDTHS[index % FROM_WIDTHS.length];
  const subjectWidth = SUBJECT_WIDTHS[index % SUBJECT_WIDTHS.length];
  const snippetWidth = SNIPPET_WIDTHS[index % SNIPPET_WIDTHS.length];

  // Staggered animation delay
  const delay = index * 0.05;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        py: 1.5,
        px: 2,
        alignItems: 'flex-start',
        opacity: 0,
        animation: `fadeIn 0.3s ease-out ${delay}s forwards`,
        '@keyframes fadeIn': {
          '0%': { opacity: 0, transform: 'translateY(4px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <Skeleton
          variant="rounded"
          width={20}
          height={20}
          animation={animation}
          sx={{ mt: 0.5, borderRadius: 0.5 }}
        />
      )}

      {/* Avatar */}
      <Skeleton
        variant="circular"
        width={40}
        height={40}
        animation={animation}
        sx={{ mt: 0.5 }}
      />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* From & Date row */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Skeleton
            variant="text"
            width={fromWidth}
            height={20}
            animation={animation}
          />
          <Box sx={{ flex: 1 }} />
          <Skeleton
            variant="text"
            width={60}
            height={16}
            animation={animation}
          />
        </Box>

        {/* Subject */}
        <Skeleton
          variant="text"
          width={subjectWidth}
          height={20}
          animation={animation}
          sx={{ mb: 0.5 }}
        />

        {/* Snippet */}
        <Skeleton
          variant="text"
          width={snippetWidth}
          height={16}
          animation={animation}
        />

        {/* Labels */}
        {showLabels && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
            <Skeleton
              variant="rounded"
              width={60}
              height={18}
              animation={animation}
              sx={{ borderRadius: 2 }}
            />
            <Skeleton
              variant="rounded"
              width={50}
              height={18}
              animation={animation}
              sx={{ borderRadius: 2 }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
};

export const EnhancedThreadListSkeleton: React.FC<EnhancedThreadListSkeletonProps> = ({
  count = 8,
  showCheckbox = true,
  showLabels = true,
  animation = 'wave',
}) => {
  const t = useTranslations();
  const loadingText = (t.dashboard?.email as Record<string, unknown>)?.skeleton as Record<string, string> | undefined;
  const screenReaderText = loadingText?.loadingEmails ?? 'Loading emails, please wait...';

  return (
    <Box
      role="status"
      aria-label={screenReaderText}
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <React.Fragment key={index}>
          <SkeletonItem
            index={index}
            showCheckbox={showCheckbox}
            showLabels={showLabels}
            animation={animation}
          />
          {index < count - 1 && <Divider />}
        </React.Fragment>
      ))}

      {/* Screen reader text */}
      <Box
        component="span"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {screenReaderText}
      </Box>
    </Box>
  );
};

export default EnhancedThreadListSkeleton;

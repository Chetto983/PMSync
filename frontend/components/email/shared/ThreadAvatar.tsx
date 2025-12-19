import React, { useMemo } from 'react';
import { Avatar } from '@mui/material';

/**
 * Props for ThreadAvatar component
 */
export interface ThreadAvatarProps {
  /**
   * Email address of the sender
   */
  email: string;

  /**
   * Name of the sender
   */
  name: string;

  /**
   * Optional provider icon (ignored - we always show initials for better differentiation)
   */
  providerIcon?: React.ReactNode;

  /**
   * Whether this thread has unread messages
   */
  isUnread?: boolean;

  /**
   * Custom size for the avatar
   */
  size?: number;

  /**
   * Custom class name
   */
  className?: string;
}

/**
 * Parse name to get initials
 */
function getInitials(name: string): string {
  if (!name) return 'U';

  // Remove quotes and trim
  const cleanName = name.replace(/^['"]|['"]$/g, '').trim();

  // Split by space and get first letters
  const parts = cleanName.split(' ').filter(Boolean);

  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }

  // Get first letter of first and last name
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generate a consistent color based on string input
 * Uses a hash function to produce pleasing, readable colors
 */
const AVATAR_COLORS = [
  { bg: '#1976d2', text: '#fff' }, // Blue
  { bg: '#388e3c', text: '#fff' }, // Green
  { bg: '#d32f2f', text: '#fff' }, // Red
  { bg: '#7b1fa2', text: '#fff' }, // Purple
  { bg: '#f57c00', text: '#fff' }, // Orange
  { bg: '#0097a7', text: '#fff' }, // Cyan
  { bg: '#5d4037', text: '#fff' }, // Brown
  { bg: '#455a64', text: '#fff' }, // Blue Grey
  { bg: '#c2185b', text: '#fff' }, // Pink
  { bg: '#00796b', text: '#fff' }, // Teal
  { bg: '#512da8', text: '#fff' }, // Deep Purple
  { bg: '#303f9f', text: '#fff' }, // Indigo
];

function getColorFromString(str: string): { bg: string; text: string } {
  if (!str) return AVATAR_COLORS[0];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }

  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * ThreadAvatar - Enhanced avatar component with BIMI support
 *
 * Features:
 * - Displays sender's initials or provider icon
 * - Visual indicator for unread status
 * - Supports custom sizing
 * - Future: BIMI (Brand Indicators for Message Identification) support
 *
 * @example
 * ```tsx
 * <ThreadAvatar
 *   email="john@example.com"
 *   name="John Doe"
 *   isUnread={true}
 *   size={40}
 * />
 * ```
 */
export const ThreadAvatar: React.FC<ThreadAvatarProps> = ({
  email,
  name,
  // providerIcon is intentionally ignored - we always show initials for better differentiation
  isUnread = false,
  size = 40,
  className,
}) => {
  const initials = getInitials(name || email);

  // Generate consistent color based on email or name
  const colorKey = email || name || '';
  const colors = useMemo(() => getColorFromString(colorKey), [colorKey]);

  return (
    <Avatar
      sx={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        fontWeight: isUnread ? 700 : 500,
        bgcolor: colors.bg,
        color: colors.text,
        border: isUnread ? 2 : 0,
        borderColor: isUnread ? 'primary.main' : 'transparent',
        transition: 'all 0.2s ease',
        boxShadow: isUnread ? '0 0 0 2px rgba(25, 118, 210, 0.2)' : 'none',
      }}
      className={className}
    >
      {initials}
    </Avatar>
  );
};

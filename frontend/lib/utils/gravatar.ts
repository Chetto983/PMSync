/**
 * Gravatar URL utility
 *
 * Generates Gravatar URLs from email addresses using MD5 hash.
 * Used as fallback for sender photos when contact doesn't have a photo.
 *
 * @see https://docs.gravatar.com/api/avatars/images/
 */

import md5 from 'md5';

/**
 * Generate Gravatar URL for an email address
 *
 * @param email - Email address to get Gravatar for
 * @param size - Image size in pixels (default: 80)
 * @param defaultImage - What to return if no Gravatar exists:
 *   - '404' = return 404 (we handle fallback ourselves)
 *   - 'mp' = mystery person silhouette
 *   - 'identicon' = geometric pattern based on email hash
 *   - 'retro' = 8-bit style avatar
 *   - 'blank' = transparent (use with custom fallback)
 * @returns Gravatar URL
 *
 * @example
 * ```tsx
 * const url = getGravatarUrl('john@example.com');
 * // https://www.gravatar.com/avatar/d4c74594d841139328695756648b6bd6?s=80&d=404
 * ```
 */
export function getGravatarUrl(
  email: string,
  size: number = 80,
  defaultImage: '404' | 'mp' | 'identicon' | 'retro' | 'blank' = '404'
): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${defaultImage}`;
}

/**
 * Get avatar URL with Gravatar fallback
 * Priority: existingUrl > Gravatar > undefined (show initials)
 *
 * @param email - Email address
 * @param existingUrl - Existing photo URL (from contacts DB)
 * @returns Avatar URL or undefined
 *
 * @example
 * ```tsx
 * <Avatar src={getAvatarUrl(senderEmail, contact?.photoUrl)}>
 *   {initials}
 * </Avatar>
 * ```
 */
export function getAvatarUrl(
  _email: string | undefined,  // Kept for API compatibility (was used for Gravatar)
  existingUrl: string | null | undefined,
  _isKnownContact: boolean = false  // Kept for API compatibility
): string | undefined {
  // Only use existing photo URL from contacts
  // If no photo, return undefined so MUI Avatar shows colored initials
  // This matches the email detail view behavior and looks consistent
  if (existingUrl) {
    return existingUrl;
  }

  // No Gravatar fallback - colored initials look better than gray silhouettes
  return undefined;
}

/**
 * Generate a consistent color from a string (email or name)
 * Uses a hash to ensure same string always produces same color
 *
 * @param str - String to generate color from
 * @returns HSL color string
 *
 * @example
 * ```tsx
 * <Avatar sx={{ bgcolor: stringToColor(email) }}>
 *   {initials}
 * </Avatar>
 * ```
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Use golden ratio to spread colors evenly across hue spectrum
  const hue = Math.abs(hash % 360);
  // Keep saturation and lightness consistent for readable initials
  return `hsl(${hue}, 65%, 45%)`;
}

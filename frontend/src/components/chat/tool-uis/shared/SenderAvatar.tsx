import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Color palette for sender initials — 12 distinct, accessible hues.
 * Each pair: [background, text].
 */
const AVATAR_COLORS: [string, string][] = [
  ['#e3f2fd', '#1565c0'], // blue
  ['#fce4ec', '#c62828'], // red
  ['#e8f5e9', '#2e7d32'], // green
  ['#fff3e0', '#e65100'], // orange
  ['#f3e5f5', '#6a1b9a'], // purple
  ['#e0f7fa', '#00695c'], // teal
  ['#fff8e1', '#f57f17'], // amber
  ['#fbe9e7', '#bf360c'], // deep orange
  ['#e8eaf6', '#283593'], // indigo
  ['#f1f8e9', '#558b2f'], // light green
  ['#ede7f6', '#4527a0'], // deep purple
  ['#e1f5fe', '#0277bd'], // light blue
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  // Strip email angle brackets and take the display part
  const clean = name.replace(/<[^>]+>/g, '').trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

interface SenderAvatarProps {
  name: string;
  size?: number;
  fontSize?: string;
}

export function SenderAvatar({ name, size = 28, fontSize }: SenderAvatarProps) {
  const idx = hashCode(name) % AVATAR_COLORS.length;
  const [bg, fg] = AVATAR_COLORS[idx];
  const initials = getInitials(name);
  const computedFontSize = fontSize ?? `${Math.round(size * 0.38)}px`;

  return (
    <Box
      role="img"
      aria-label={name}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Typography sx={{ fontSize: computedFontSize, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {initials}
      </Typography>
    </Box>
  );
}

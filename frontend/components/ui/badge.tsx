import { forwardRef } from 'react';
import Chip, { ChipProps } from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'info';

const variantMap: Record<Variant, { color: ChipProps['color']; variant: ChipProps['variant']; sx?: SxProps<Theme> }> =
  {
    default: { color: 'default', variant: 'outlined' },
    secondary: { color: 'primary', variant: 'outlined' },
    destructive: { color: 'error', variant: 'outlined' },
    outline: { color: 'default', variant: 'outlined' },
    success: { color: 'success', variant: 'outlined' },
    info: { color: 'info', variant: 'outlined' },
  };

export interface BadgeProps extends Omit<ChipProps, 'variant' | 'color'> {
  variant?: Variant;
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(({ variant = 'default', sx, ...props }, ref) => {
  const data = variantMap[variant];

  return (
    <Chip
      ref={ref}
      variant={data.variant}
      color={data.color}
      size="small"
      sx={[
        {
          borderRadius: 9999,
          fontWeight: 600,
          letterSpacing: '0.08em',
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...props}
    />
  );
});

Badge.displayName = 'Badge';

export default Badge;

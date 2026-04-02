/**
 * ContactName — Reusable contact name text with hover card trigger
 *
 * Drop-in replacement for any Typography rendering a contact name.
 * On hover, shows a mini-CRM hover card with context from the CRM API.
 * If email is empty/falsy, renders plain text without hover behavior.
 */

import { Box, Typography } from '@mui/material';
import type { TypographyProps } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useHoverPopover } from '@/hooks/use-hover-popover';
import { ContactHoverCard } from './ContactHoverCard';

interface ContactNameProps {
  name: string;
  email: string;
  variant?: TypographyProps['variant'];
  color?: string;
  sx?: SxProps<Theme>;
  component?: React.ElementType;
  noWrap?: boolean;
  fontWeight?: number;
  fontSize?: string;
}

export function ContactName({
  name,
  email,
  variant = 'body2',
  color,
  sx,
  component,
  noWrap,
  fontWeight,
  fontSize,
}: ContactNameProps) {
  const { anchorEl, open, triggerProps, popoverProps } = useHoverPopover();

  // No email = plain text, no hover behavior
  if (!email) {
    return (
      <Typography
        variant={variant}
        color={color}
        component={component || 'span'}
        noWrap={noWrap}
        sx={{ fontWeight, fontSize, ...sx }}
      >
        {name}
      </Typography>
    );
  }

  return (
    <Box component="span" sx={{ display: 'inline' }}>
      <Typography
        variant={variant}
        color={color}
        component={component || 'span'}
        noWrap={noWrap}
        sx={{ fontWeight, fontSize, cursor: 'default', ...sx }}
        {...triggerProps}
      >
        {name}
      </Typography>
      <ContactHoverCard
        email={email}
        anchorEl={anchorEl}
        open={open}
        popoverProps={popoverProps}
      />
    </Box>
  );
}

export default ContactName;

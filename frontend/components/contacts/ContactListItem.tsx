/**
 * Contact List Item — Compact 2-line layout (matches ThreadListItem style)
 *
 * Line 1: Name + VIP star + primary email (merged, truncated)
 * Line 2: Company — job title (if present)
 *
 * Design decisions:
 * - VIP: 3px left accent border (matches email unread pattern)
 * - Checkbox: appears on hover, when selected, or on touch/mobile
 * - Action bar: hover on desktop, always visible on touch/mobile (smaller icons)
 * - ~52px compact row height
 */

import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Checkbox,
  Avatar,
  IconButton,
  Tooltip,
  Fade,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Mail as MailIcon,
  Phone as PhoneIcon,
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  Building2 as BuildingIcon,
  Star as StarIcon,
} from 'lucide-react';
import type { Contact } from '@/lib/api/contacts';
import type { LeadScoreTier } from '@/lib/api/crm-lead-scores';
import { useTranslations } from '@/lib/hooks/use-translations';
import { stringToColor } from '@/lib/utils/gravatar';
import { LeadScoreBadge } from '@/components/dashboard/crm-lead-score/LeadScoreBadge';
import { ContactName } from './ContactName';

function getInitials(contact: Contact): string {
  const name = contact.displayName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

function getDisplayName(contact: Contact): string {
  return contact.displayName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    contact.emails?.[0]?.value || 'Unknown';
}

function getPrimaryEmail(contact: Contact): string | null {
  const primary = contact.emails?.find(e => e.type === 'primary' || e.type === 'work');
  return primary?.value || contact.emails?.[0]?.value || null;
}

function getPrimaryPhone(contact: Contact): string | null {
  const primary = contact.phoneNumbers?.find(p => p.type === 'mobile' || p.type === 'work');
  return primary?.value || contact.phoneNumbers?.[0]?.value || null;
}

interface ContactListItemProps {
  contact: Contact;
  selected?: boolean;
  multiSelected?: boolean;
  isHovered?: boolean;
  leadScore?: number;
  leadScoreTier?: LeadScoreTier;
  onToggleSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEmail?: (email: string) => void;
  onCall?: (phone: string) => void;
  onClick?: (id: string) => void;
  onToggleVip?: (id: string, isVip: boolean) => void;
  onMouseEnter?: (id: string) => void;
  onMouseLeave?: () => void;
}

export const ContactListItem = React.memo<ContactListItemProps>(
  ({
    contact,
    selected = false,
    multiSelected = false,
    isHovered = false,
    leadScore,
    leadScoreTier,
    onToggleSelect,
    onEdit,
    onDelete,
    onEmail,
    onCall,
    onClick,
    onToggleVip,
    onMouseEnter,
    onMouseLeave,
  }) => {
    const t = useTranslations();
    const theme = useTheme();
    const isNarrowViewport = useMediaQuery(theme.breakpoints.down('md'));
    const hasTouchPointer = useMediaQuery('(hover: none), (pointer: coarse)');
    const isTouchLayout = isNarrowViewport || hasTouchPointer;
    const displayName = useMemo(() => getDisplayName(contact), [contact]);
    const initials = useMemo(() => getInitials(contact), [contact]);
    const primaryEmail = useMemo(() => getPrimaryEmail(contact), [contact]);
    const primaryPhone = useMemo(() => getPrimaryPhone(contact), [contact]);

    const stop = (e: React.MouseEvent) => e.stopPropagation();

    const handleClick = () => onClick?.(contact.id);
    const handleMouseEnter = () => onMouseEnter?.(contact.id);
    const handleCheckbox = (e: React.MouseEvent) => { stop(e); onToggleSelect?.(contact.id); };
    const handleEdit = (e: React.MouseEvent) => { stop(e); onEdit?.(contact.id); };
    const handleDelete = (e: React.MouseEvent) => { stop(e); onDelete?.(contact.id); };
    const handleEmail = (e: React.MouseEvent) => { stop(e); if (primaryEmail) onEmail?.(primaryEmail); };
    const handleCall = (e: React.MouseEvent) => { stop(e); if (primaryPhone) onCall?.(primaryPhone); };
    const handleToggleVip = (e: React.MouseEvent) => { stop(e); onToggleVip?.(contact.id, !contact.isVip); };

    const hasActionBar = onEdit || onDelete || onEmail || onCall || onToggleVip;

    return (
      <Box
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={onMouseLeave}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1,
          minHeight: 52,
          cursor: 'pointer',
          position: 'relative',
          // VIP: left accent border (transparent when not VIP for alignment)
          borderLeft: 3,
          borderLeftColor: contact.isVip ? 'warning.main' : 'transparent',
          borderBottom: '1px solid',
          borderBottomColor: 'divider',
          bgcolor: selected ? 'action.selected' : 'transparent',
          transition: 'background-color 0.15s ease',
          '&:hover': {
            bgcolor: selected ? 'action.selected' : 'action.hover',
          },
        }}
      >
        {/* Checkbox — visible on hover or selected */}
        <Fade in={isHovered || multiSelected || isTouchLayout}>
          <Box sx={{ width: 36, flexShrink: 0 }}>
            <Checkbox
              checked={multiSelected}
              onClick={handleCheckbox}
              size="small"
              sx={{ p: 0.5 }}
            />
          </Box>
        </Fade>

        {/* Avatar — 28px with color hash */}
        <Avatar
          src={contact.photoUrl || undefined}
          sx={{
            width: 28,
            height: 28,
            fontSize: '0.7rem',
            flexShrink: 0,
            bgcolor: contact.photoUrl ? undefined : stringToColor(displayName),
          }}
        >
          {initials}
        </Avatar>

        {/* Content — 2-line compact layout */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Line 1: Name + VIP star + email */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            <ContactName
              name={displayName}
              email={primaryEmail || ''}
              variant="body2"
              fontWeight={600}
              fontSize="0.8125rem"
              noWrap
            />
            {contact.isVip && (
              <StarIcon
                size={12}
                fill="var(--mui-palette-warning-main)"
                style={{ color: 'var(--mui-palette-warning-main)', flexShrink: 0 }}
              />
            )}
            {leadScore != null && leadScore > 0 && (
              <LeadScoreBadge score={leadScore} tier={leadScoreTier} size="small" />
            )}
            {primaryEmail && (
              <Typography
                variant="caption"
                color="text.disabled"
                noWrap
                sx={{ fontSize: '0.6875rem', ml: 'auto', flexShrink: 1, minWidth: 0 }}
              >
                {primaryEmail}
              </Typography>
            )}
          </Box>

          {/* Line 2: Company — job title (if present) */}
          {contact.company && (
            <Typography
              variant="body2"
              color="text.secondary"
              noWrap
              sx={{ fontSize: '0.8125rem' }}
            >
              <BuildingIcon size={11} style={{ verticalAlign: '-1px', marginRight: 4, opacity: 0.5 }} />
              {contact.company}
              {contact.jobTitle && (
                <Box component="span" sx={{ color: 'text.disabled' }}>
                  {' \u2014 '}{contact.jobTitle}
                </Box>
              )}
            </Typography>
          )}
        </Box>

        {/* Action bar — visible on hover (desktop) or always (touch/mobile) */}
        {hasActionBar && (
          <Fade in={isHovered || isTouchLayout}>
            <Box
              className="contact-action-bar"
              sx={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                gap: 0.25,
                bgcolor: 'background.paper',
                borderRadius: 1,
                boxShadow: isTouchLayout ? 0 : 2,
                p: 0.25,
              }}
            >
              {onToggleVip && (
                <Tooltip title={contact.isVip ? (t.contacts?.actions?.removeVip || 'Remove VIP') : (t.contacts?.actions?.markVip || 'Mark as VIP')}>
                  <IconButton size="small" onClick={handleToggleVip} sx={{ p: 0.5, color: contact.isVip ? 'warning.main' : 'action.active' }}>
                    {contact.isVip ? <StarIcon size={isTouchLayout ? 14 : 16} fill="currentColor" /> : <StarIcon size={isTouchLayout ? 14 : 16} />}
                  </IconButton>
                </Tooltip>
              )}
              {primaryEmail && onEmail && (
                <Tooltip title={t.contacts?.actions?.sendEmail || 'Send email'}>
                  <IconButton size="small" onClick={handleEmail} sx={{ p: 0.5 }}>
                    <MailIcon size={isTouchLayout ? 14 : 16} />
                  </IconButton>
                </Tooltip>
              )}
              {primaryPhone && onCall && (
                <Tooltip title={t.contacts?.actions?.call || 'Call'}>
                  <IconButton size="small" onClick={handleCall} sx={{ p: 0.5 }}>
                    <PhoneIcon size={isTouchLayout ? 14 : 16} />
                  </IconButton>
                </Tooltip>
              )}
              {onEdit && (
                <Tooltip title={t.common?.edit || 'Edit'}>
                  <IconButton size="small" onClick={handleEdit} sx={{ p: 0.5 }}>
                    <EditIcon size={isTouchLayout ? 14 : 16} />
                  </IconButton>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip title={t.common?.delete || 'Delete'}>
                  <IconButton size="small" onClick={handleDelete} color="error" sx={{ p: 0.5 }}>
                    <DeleteIcon size={isTouchLayout ? 14 : 16} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Fade>
        )}
      </Box>
    );
  },
  (prev, next) => (
    prev.contact.id === next.contact.id &&
    prev.contact.displayName === next.contact.displayName &&
    prev.contact.firstName === next.contact.firstName &&
    prev.contact.lastName === next.contact.lastName &&
    prev.contact.company === next.contact.company &&
    prev.contact.jobTitle === next.contact.jobTitle &&
    prev.contact.photoUrl === next.contact.photoUrl &&
    prev.contact.isVip === next.contact.isVip &&
    prev.selected === next.selected &&
    prev.multiSelected === next.multiSelected &&
    prev.isHovered === next.isHovered &&
    prev.leadScore === next.leadScore
  ),
);

ContactListItem.displayName = 'ContactListItem';

export default ContactListItem;

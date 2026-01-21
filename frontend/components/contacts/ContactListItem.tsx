import React, { useMemo } from 'react';
import {
  ListItemButton,
  Box,
  Typography,
  Checkbox,
  Avatar,
  Divider,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from '@mui/material';
import { Mail, Phone, Edit, Trash2, Building, Star } from 'lucide-react';
import type { Contact } from '@/lib/api/contacts';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Props for ContactListItem component
 */
interface ContactListItemProps {
  /**
   * Contact data
   */
  contact: Contact;

  /**
   * Whether this contact is selected (for viewing details)
   */
  selected?: boolean;

  /**
   * Whether this contact is multi-selected (checkbox)
   */
  multiSelected?: boolean;

  /**
   * Callback to toggle selection
   */
  onToggleSelect?: (id: string) => void;

  /**
   * Callback to edit contact
   */
  onEdit?: (id: string) => void;

  /**
   * Callback to delete contact
   */
  onDelete?: (id: string) => void;

  /**
   * Callback to email contact
   */
  onEmail?: (email: string) => void;

  /**
   * Callback to call contact
   */
  onCall?: (phone: string) => void;

  /**
   * Callback when clicked
   */
  onClick?: () => void;

  /**
   * Callback to toggle VIP status
   */
  onToggleVip?: (id: string, isVip: boolean) => void;
}

/**
 * Get initials from contact name
 */
function getInitials(contact: Contact): string {
  const name = contact.displayName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

/**
 * Get display name from contact
 */
function getDisplayName(contact: Contact): string {
  return contact.displayName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    contact.emails?.[0]?.value ||
    'Unknown';
}

/**
 * Get primary email from contact
 */
function getPrimaryEmail(contact: Contact): string | null {
  const primaryEmail = contact.emails?.find(e => e.type === 'primary' || e.type === 'work');
  return primaryEmail?.value || contact.emails?.[0]?.value || null;
}

/**
 * Get primary phone from contact
 */
function getPrimaryPhone(contact: Contact): string | null {
  const primaryPhone = contact.phoneNumbers?.find(p => p.type === 'mobile' || p.type === 'work');
  return primaryPhone?.value || contact.phoneNumbers?.[0]?.value || null;
}

/**
 * ContactListItem - Individual contact in list with selection and hover actions
 *
 * Features:
 * - Checkbox for multi-selection
 * - Avatar with initials
 * - Contact info (name, email, company)
 * - Hover action bar (edit, delete, email, call)
 * - Optimized with React.memo
 */
export const ContactListItem = React.memo<ContactListItemProps>(
  ({
    contact,
    selected = false,
    multiSelected = false,
    onToggleSelect,
    onEdit,
    onDelete,
    onEmail,
    onCall,
    onClick,
    onToggleVip,
  }) => {
    const theme = useTheme();
    const t = useTranslations();
    const displayName = useMemo(() => getDisplayName(contact), [contact]);
    const initials = useMemo(() => getInitials(contact), [contact]);
    const primaryEmail = useMemo(() => getPrimaryEmail(contact), [contact]);
    const primaryPhone = useMemo(() => getPrimaryPhone(contact), [contact]);

    const handleClick = (e: React.MouseEvent) => {
      // Don't trigger onClick if clicking on checkbox or action buttons
      if ((e.target as HTMLElement).closest('.MuiCheckbox-root, .contact-action-bar')) {
        return;
      }
      onClick?.();
    };

    const handleToggleSelect = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleSelect?.(contact.id);
    };

    const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(contact.id);
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(contact.id);
    };

    const handleEmail = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (primaryEmail) {
        onEmail?.(primaryEmail);
      }
    };

    const handleCall = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (primaryPhone) {
        onCall?.(primaryPhone);
      }
    };

    const handleToggleVip = (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleVip?.(contact.id, !contact.isVip);
    };

    return (
      <>
        <Box
          sx={{
            position: 'relative',
            '&:hover .contact-action-bar': {
              opacity: 1,
              visibility: 'visible',
            },
          }}
        >
          <ListItemButton
            selected={selected}
            onClick={handleClick}
            sx={{
              py: 1.5,
              px: 2,
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
              '&.Mui-selected': {
                bgcolor: 'action.selected',
              },
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            {/* Checkbox */}
            {onToggleSelect && (
              <Box onClick={handleToggleSelect}>
                <Checkbox
                  checked={multiSelected}
                  sx={{
                    p: 0,
                    width: { xs: 44, sm: 'auto' },
                    height: { xs: 44, sm: 'auto' },
                    color: 'action.active',
                    '&.Mui-checked': {
                      color: 'primary.main',
                    },
                    '& .MuiSvgIcon-root': {
                      fontSize: 20,
                    },
                  }}
                />
              </Box>
            )}

            {/* Avatar */}
            <Avatar
              src={contact.photoUrl || undefined}
              sx={{
                width: 40,
                height: 40,
                bgcolor: 'primary.main',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {initials}
            </Avatar>

            {/* Content */}
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {/* Name */}
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName}
              </Typography>

              {/* Email */}
              {primaryEmail && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Mail size={12} />
                  {primaryEmail}
                </Typography>
              )}

              {/* Company */}
              {contact.company && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                  }}
                >
                  <Building size={12} />
                  {contact.company}
                  {contact.jobTitle && ` - ${contact.jobTitle}`}
                </Typography>
              )}
            </Box>
          </ListItemButton>

          {/* Floating Action Bar - Glassmorphism */}
          {(onEdit || onDelete || onEmail || onCall || onToggleVip) && (
            <Box
              className="contact-action-bar"
              sx={{
                position: 'absolute',
                right: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0,
                visibility: 'hidden',
                transition: 'opacity 0.2s ease, visibility 0.2s ease',
                zIndex: 10,
                display: 'flex',
                gap: 0.5,
                bgcolor: alpha(theme.palette.background.paper, 0.85),
                backdropFilter: 'blur(12px)',
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                borderRadius: 2,
                boxShadow: `0 4px 20px ${alpha(theme.palette.common.black, 0.1)}`,
                p: 0.5,
              }}
            >
              {onToggleVip && (
                <Tooltip title={contact.isVip ? (t.contacts?.actions?.removeVip || 'Remove VIP') : (t.contacts?.actions?.markVip || 'Mark as VIP')}>
                  <IconButton
                    size="small"
                    onClick={handleToggleVip}
                    sx={{
                      color: contact.isVip ? 'warning.main' : 'action.active',
                    }}
                  >
                    <Star size={18} fill={contact.isVip ? 'currentColor' : 'none'} />
                  </IconButton>
                </Tooltip>
              )}
              {primaryEmail && onEmail && (
                <Tooltip title={t.contacts?.actions?.sendEmail || 'Send email'}>
                  <IconButton size="small" onClick={handleEmail}>
                    <Mail size={18} />
                  </IconButton>
                </Tooltip>
              )}
              {primaryPhone && onCall && (
                <Tooltip title={t.contacts?.actions?.call || 'Call'}>
                  <IconButton size="small" onClick={handleCall}>
                    <Phone size={18} />
                  </IconButton>
                </Tooltip>
              )}
              {onEdit && (
                <Tooltip title={t.common?.edit || 'Edit'}>
                  <IconButton size="small" onClick={handleEdit}>
                    <Edit size={18} />
                  </IconButton>
                </Tooltip>
              )}
              {onDelete && (
                <Tooltip title={t.common?.delete || 'Delete'}>
                  <IconButton size="small" onClick={handleDelete} color="error">
                    <Trash2 size={18} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}
        </Box>
        <Divider />
      </>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for React.memo
    return (
      prevProps.contact.id === nextProps.contact.id &&
      prevProps.contact.displayName === nextProps.contact.displayName &&
      prevProps.contact.firstName === nextProps.contact.firstName &&
      prevProps.contact.lastName === nextProps.contact.lastName &&
      prevProps.contact.company === nextProps.contact.company &&
      prevProps.contact.photoUrl === nextProps.contact.photoUrl &&
      prevProps.contact.isVip === nextProps.contact.isVip &&
      prevProps.selected === nextProps.selected &&
      prevProps.multiSelected === nextProps.multiSelected
    );
  }
);

ContactListItem.displayName = 'ContactListItem';

export default ContactListItem;

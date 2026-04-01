import { memo, useMemo } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Activity,
  Building2,
  Handshake,
  Mail,
  PanelRightClose,
  PanelRightOpen,
  Ticket,
  UserPlus,
} from 'lucide-react';
import { useCrmContextByContact, useCrmContextByEmail } from '@/hooks/queries/use-crm-context';
import { useLocale } from '@/lib/hooks/use-locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { CrmContactContext } from '@/lib/api/crm-context';

const SIDEBAR_WIDTH = 320;

export interface EntityContextSidebarProps {
  contactId?: string;
  email?: string;
  contactName?: string | null;
  contactCompany?: string | null;
  open: boolean;
  onToggle: () => void;
  onCreateContact?: () => void;
}

function getRelationshipStrength(emailCount: number): 'weak' | 'moderate' | 'strong' {
  if (emailCount >= 20) return 'strong';
  if (emailCount >= 5) return 'moderate';
  return 'weak';
}

const strengthColors: Record<'weak' | 'moderate' | 'strong', string> = {
  weak: '#ef5350',
  moderate: '#ff9800',
  strong: '#4caf50',
};

function formatCurrency(amount: string | null, currency: string, locale: string): string {
  if (!amount) return '-';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '-';
  return new Intl.NumberFormat(locale || 'en', { style: 'currency', currency }).format(num);
}

const SidebarSkeleton = memo(function SidebarSkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      <Skeleton variant="circular" width={40} height={40} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="80%" />
      <Divider sx={{ my: 2 }} />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rectangular" height={48} sx={{ mt: 1, borderRadius: 1 }} />
      <Divider sx={{ my: 2 }} />
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rectangular" height={32} sx={{ mt: 1, borderRadius: 1 }} />
      <Skeleton variant="rectangular" height={32} sx={{ mt: 1, borderRadius: 1 }} />
    </Box>
  );
});

interface ContactCardProps {
  name: string | null;
  email?: string;
  company: string | null;
}

const ContactCard = memo(function ContactCard({ name, email, company }: ContactCardProps) {
  const displayName = name || email || '?';
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
      <Avatar sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontSize: 16 }}>
        {initials}
      </Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2" noWrap>
          {displayName}
        </Typography>
        {email && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {email}
          </Typography>
        )}
        {company && (
          <Typography variant="caption" color="text.secondary" display="block" noWrap>
            {company}
          </Typography>
        )}
      </Box>
    </Box>
  );
});

interface SidebarContentProps {
  data: CrmContactContext;
  contactName: string | null;
  email?: string;
  contactCompany: string | null;
}

const SidebarContent = memo(function SidebarContent({
  data,
  contactName,
  email,
  contactCompany,
}: SidebarContentProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const tc = t.crmContext;

  const strength = useMemo(
    () => getRelationshipStrength(data.emailCount),
    [data.emailCount],
  );

  const activeTickets = useMemo(
    () => data.tickets.filter((ticket) => ticket.status !== 'closed' && ticket.status !== 'resolved'),
    [data.tickets],
  );
  const hasCrmContext = !!data.account || data.deals.length > 0 || activeTickets.length > 0 || data.recentActivities.length > 0;

  const resolvedName = contactName ?? data.contact.displayName ?? null;
  const resolvedEmail = email ?? data.contact.email ?? undefined;
  const resolvedCompany = contactCompany ?? data.contact.company ?? data.account?.name ?? null;

  return (
    <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
      <ContactCard
        name={resolvedName}
        email={resolvedEmail}
        company={resolvedCompany}
      />

      {!hasCrmContext && (
        <Alert severity="info" variant="outlined" sx={{ mb: 2, fontSize: '0.8rem' }}>
          {tc?.noCrmData ?? 'No CRM data yet - AI will analyze after next sync.'}
        </Alert>
      )}

      <Divider sx={{ my: 1.5 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {tc?.relationshipStrength ?? 'Relationship'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Activity size={14} />
          <Box
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              bgcolor: 'action.hover',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: strength === 'strong' ? '100%' : strength === 'moderate' ? '55%' : '20%',
                height: '100%',
                bgcolor: strengthColors[strength],
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: strengthColors[strength], fontWeight: 600 }}>
            {tc?.[
              strength === 'strong'
                ? 'strengthStrong'
                : strength === 'moderate'
                  ? 'strengthModerate'
                  : 'strengthWeak'
            ] ?? strength}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {(tc?.emailCount ?? '{count} emails exchanged').replace('{count}', String(data.emailCount))}
          {data.lastInteraction ? ` - ${new Date(data.lastInteraction).toLocaleDateString(locale)}` : ''}
        </Typography>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {tc?.linkedAccount ?? 'Account'}
        </Typography>
        {data.account ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          >
            <Building2 size={16} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap fontWeight={500}>
                {data.account.name}
              </Typography>
              {data.account.industry && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {data.account.industry}
                </Typography>
              )}
            </Box>
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled">
            {tc?.noAccount ?? 'No linked account'}
          </Typography>
        )}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {tc?.openDeals ?? 'Open Deals'} ({data.deals.length})
        </Typography>
        {data.deals.length > 0 ? (
          <List dense disablePadding>
            {data.deals.map((deal) => (
              <ListItem key={deal.id} disablePadding sx={{ mb: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <Handshake size={14} />
                </ListItemIcon>
                <ListItemText
                  primary={(
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                        {deal.name}
                      </Typography>
                      {deal.stage && (
                        <Chip
                          label={deal.stage.name}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            borderColor: deal.stage.color ?? undefined,
                            color: deal.stage.color ?? undefined,
                          }}
                        />
                      )}
                    </Box>
                  )}
                  secondary={formatCurrency(deal.amount, deal.currency, locale)}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.disabled">
            {tc?.noDeals ?? 'No open deals'}
          </Typography>
        )}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          {tc?.activeTickets ?? 'Active Tickets'} ({activeTickets.length})
        </Typography>
        {activeTickets.length > 0 ? (
          <List dense disablePadding>
            {activeTickets.map((ticket) => (
              <ListItem key={ticket.id} disablePadding sx={{ mb: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <Ticket size={14} />
                </ListItemIcon>
                <ListItemText
                  primary={(
                    <Typography variant="body2" noWrap>
                      {ticket.subject}
                    </Typography>
                  )}
                  secondary={(
                    <Chip
                      label={ticket.status.replace('_', ' ')}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem', mt: 0.25 }}
                    />
                  )}
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.disabled">
            {tc?.noTickets ?? 'No active tickets'}
          </Typography>
        )}
      </Box>
    </Box>
  );
});

export const EntityContextSidebar = memo(function EntityContextSidebar({
  contactId,
  email,
  contactName,
  contactCompany,
  open,
  onToggle,
  onCreateContact,
}: EntityContextSidebarProps) {
  const t = useTranslations();
  const tc = t.crmContext;

  const contactQuery = useCrmContextByContact(contactId ?? '');
  const emailQuery = useCrmContextByEmail(!contactId && email ? email : '');

  const data = contactId ? contactQuery.data : emailQuery.data;
  const isLoading = contactId ? contactQuery.isLoading : emailQuery.isLoading;
  const isError = contactId ? contactQuery.isError : emailQuery.isError;
  const hasIdentifier = !!contactId || !!email;
  const isUnknownContact = !contactId && !!email && !isLoading && !isError && data === null;

  return (
    <>
      {!open && hasIdentifier && (
        <Tooltip title={tc?.expand ?? 'Show CRM context'} placement="left">
          <IconButton
            onClick={onToggle}
            size="small"
            sx={{
              position: 'absolute',
              right: 8,
              top: 12,
              zIndex: (theme) => theme.zIndex.drawer - 1,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <PanelRightOpen size={18} />
          </IconButton>
        </Tooltip>
      )}

      <Drawer
        variant="persistent"
        anchor="right"
        open={open && hasIdentifier}
        sx={{
          width: open ? SIDEBAR_WIDTH : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            position: 'relative',
            borderLeft: 1,
            borderColor: 'divider',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Mail size={16} />
            <Typography variant="subtitle2">
              {tc?.sidebarTitle ?? 'CRM Context'}
            </Typography>
          </Box>
          <Tooltip title={tc?.collapse ?? 'Collapse sidebar'}>
            <IconButton size="small" onClick={onToggle}>
              <PanelRightClose size={16} />
            </IconButton>
          </Tooltip>
        </Box>

        {isLoading && <SidebarSkeleton />}

        {isError && (
          <Box sx={{ p: 2 }}>
            <Alert severity="warning" variant="outlined" sx={{ fontSize: '0.8rem' }}>
              {tc?.noCrmData ?? 'No CRM data yet - AI will analyze after next sync.'}
            </Alert>
          </Box>
        )}

        {isUnknownContact && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {tc?.unknownContact ?? 'Unknown Contact'}
            </Typography>
            {onCreateContact && (
              <Chip
                icon={<UserPlus size={14} />}
                label={tc?.createContact ?? 'Create Contact'}
                variant="outlined"
                onClick={onCreateContact}
                sx={{ cursor: 'pointer' }}
              />
            )}
          </Box>
        )}

        {!isLoading && !isError && data && (
          <SidebarContent
            data={data}
            contactName={contactName ?? data.contact.displayName ?? null}
            email={email ?? data.contact.email ?? undefined}
            contactCompany={contactCompany ?? data.contact.company ?? null}
          />
        )}
      </Drawer>
    </>
  );
});

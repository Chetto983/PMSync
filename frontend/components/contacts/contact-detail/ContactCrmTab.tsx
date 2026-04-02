import { memo, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Building2, Handshake, Ticket, Mail, MailOpen, ListTodo } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import { useCrmContextByContact } from '@/hooks/queries/use-crm-context';
import { useActivityTimeline } from '@/hooks/queries/use-crm-activities';
import { useContactTimeline } from '@/hooks/queries/use-contacts';
import { ActivityTimeline } from '@/components/common/ActivityTimeline';

interface ContactCrmTabProps {
  contactId: string;
}

function formatCurrency(amount: string | null, currency: string, locale: string): string {
  if (!amount) return '—';
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat(locale || 'en', { style: 'currency', currency }).format(num);
}

const CrmTabSkeleton = memo(function CrmTabSkeleton() {
  return (
    <Box sx={{ py: 2 }}>
      <Skeleton variant="text" width="30%" sx={{ mb: 1 }} />
      <Skeleton variant="rectangular" height={48} sx={{ mb: 3, borderRadius: 1 }} />
      <Skeleton variant="text" width="30%" sx={{ mb: 1 }} />
      <Skeleton variant="rectangular" height={80} sx={{ mb: 3, borderRadius: 1 }} />
      <Skeleton variant="text" width="30%" sx={{ mb: 1 }} />
      <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
    </Box>
  );
});

export const ContactCrmTab = memo(function ContactCrmTab({ contactId }: ContactCrmTabProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const tc = t.crmContext;
  const td = t.contacts?.details;

  const { data: crmData, isLoading, isError } = useCrmContextByContact(contactId);
  const timelineResult = useContactTimeline(contactId);

  // Get accountId for activity timeline (if linked)
  const accountId = crmData?.account?.id ?? '';
  const timelineQuery = useActivityTimeline('account', accountId, 20);

  // Extract related emails (recent 5) from unified timeline
  const relatedEmails = useMemo(() => {
    if (!timelineResult.data?.pages) return [];
    return timelineResult.data.pages
      .flatMap((p) => p.entries)
      .filter((e) => e.type === 'email_sent' || e.type === 'email_received')
      .slice(0, 5);
  }, [timelineResult.data]);

  // Extract upcoming tasks from unified timeline
  const upcomingTasks = useMemo(() => {
    if (!timelineResult.data?.pages) return [];
    return timelineResult.data.pages
      .flatMap((p) => p.entries)
      .filter((e) => e.type === 'task' && (e.metadata?.status === 'pending' || e.metadata?.status === 'in_progress'))
      .slice(0, 5);
  }, [timelineResult.data]);

  const allActivities = useMemo(() => {
    if (!timelineQuery.data?.pages) return [];
    return timelineQuery.data.pages.flatMap((p) => p.data);
  }, [timelineQuery.data]);

  const fallbackActivities = useMemo(() => {
    if (!crmData?.recentActivities?.length) return [];
    return crmData.recentActivities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      content: activity.content,
      createdAt: activity.createdAt,
      metadata: null,
    }));
  }, [crmData?.recentActivities]);

  const timelineActivities = useMemo(() => {
    if (allActivities.length > 0) {
      return allActivities;
    }
    return fallbackActivities;
  }, [allActivities, fallbackActivities]);

  const handleLoadMore = useCallback(() => {
    if (timelineQuery.hasNextPage && !timelineQuery.isFetchingNextPage) {
      timelineQuery.fetchNextPage();
    }
  }, [timelineQuery]);

  if (isLoading) return <CrmTabSkeleton />;

  if (isError || !crmData) {
    return (
      <Box sx={{ py: 2 }}>
        <Alert severity="info" variant="outlined">
          {tc?.noCrmData ?? 'No CRM data yet — AI will analyze after next sync.'}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 2 }}>
      {/* Related Emails */}
      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Mail size={16} />
        {td?.relatedEmails?.title ?? 'Related Emails'}
      </Typography>
      {relatedEmails.length > 0 ? (
        <List dense disablePadding sx={{ mb: 3 }}>
          {relatedEmails.map((entry) => (
            <ListItem key={entry.id} sx={{ px: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                {entry.type === 'email_sent' ? <Mail size={16} /> : <MailOpen size={16} />}
              </ListItemIcon>
              <ListItemText
                primary={entry.title}
                secondary={new Date(entry.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
          {td?.relatedEmails?.empty ?? 'No related emails'}
        </Typography>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Upcoming Tasks */}
      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <ListTodo size={16} />
        {td?.upcomingTasks?.title ?? 'Upcoming Tasks'}
      </Typography>
      {upcomingTasks.length > 0 ? (
        <List dense disablePadding sx={{ mb: 3 }}>
          {upcomingTasks.map((entry) => (
            <ListItem key={entry.id} sx={{ px: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <ListTodo size={16} />
              </ListItemIcon>
              <ListItemText
                primary={entry.title}
                secondary={
                  entry.metadata?.dueDate
                    ? new Date(entry.metadata.dueDate as string).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                    : null
                }
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              {entry.metadata?.status != null && (
                <Chip
                  label={String(entry.metadata.status).replace('_', ' ')}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.7rem', ml: 1 }}
                />
              )}
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
          {td?.upcomingTasks?.empty ?? 'No upcoming tasks'}
        </Typography>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Linked Account */}
      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Building2 size={16} />
        {tc?.linkedAccount ?? 'Account'}
      </Typography>
      {crmData.account ? (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 3 }}>
          <Typography variant="body2" fontWeight={500}>{crmData.account.name}</Typography>
          {crmData.account.industry && (
            <Typography variant="caption" color="text.secondary">{crmData.account.industry}</Typography>
          )}
          {crmData.account.website && (
            <Typography variant="caption" color="text.secondary" display="block">{crmData.account.website}</Typography>
          )}
        </Paper>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
          {tc?.noAccount ?? 'No linked account'}
        </Typography>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Open Deals */}
      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Handshake size={16} />
        {tc?.openDeals ?? 'Open Deals'} ({crmData.deals.length})
      </Typography>
      {crmData.deals.length > 0 ? (
        <Paper variant="outlined" sx={{ mb: 3, overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t.crmDeals?.columns?.name ?? 'Name'}</TableCell>
                <TableCell>{t.crmDeals?.columns?.stage ?? 'Stage'}</TableCell>
                <TableCell align="right">{t.crmDeals?.columns?.amount ?? 'Value'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {crmData.deals.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell>{deal.name}</TableCell>
                  <TableCell>
                    {deal.stage && (
                      <Chip
                        label={deal.stage.name}
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 22,
                          fontSize: '0.7rem',
                          borderColor: deal.stage.color ?? undefined,
                          color: deal.stage.color ?? undefined,
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(deal.amount, deal.currency, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
          {tc?.noDeals ?? 'No open deals'}
        </Typography>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Tickets */}
      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Ticket size={16} />
        {tc?.activeTickets ?? 'Active Tickets'} ({crmData.tickets.length})
      </Typography>
      {crmData.tickets.length > 0 ? (
        <Paper variant="outlined" sx={{ mb: 3, overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t.crmTickets?.columns?.subject ?? 'Subject'}</TableCell>
                <TableCell>{t.crmTickets?.columns?.status ?? 'Status'}</TableCell>
                <TableCell>{t.crmTickets?.columns?.createdAt ?? 'Date'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {crmData.tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>{ticket.subject}</TableCell>
                  <TableCell>
                    <Chip
                      label={ticket.status.replace('_', ' ')}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(ticket.createdAt).toLocaleDateString(locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : (
        <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
          {tc?.noTickets ?? 'No active tickets'}
        </Typography>
      )}

      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {t.activityTimeline?.title ?? 'Activity Timeline'}
      </Typography>
      <ActivityTimeline
        activities={timelineActivities}
        isLoading={!!accountId && timelineQuery.isLoading}
        isLoadingMore={timelineQuery.isFetchingNextPage}
        hasMore={!!accountId && !!timelineQuery.hasNextPage}
        onLoadMore={accountId ? handleLoadMore : undefined}
      />
    </Box>
  );
});

'use client';

import { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  Grid,
  Skeleton,
} from '@mui/material';
import { Headset, UserCheck, AlertTriangle } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useTickets, useAssignTicket } from '@/hooks/queries/use-crm-tickets';
import { SlaBadge } from '@/components/common';
import { authClient } from '@/lib/auth-client';
import type { Ticket } from '@/lib/api/crm-tickets';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function priorityColor(priority: string) {
  switch (priority) {
    case 'urgent': return 'error';
    case 'high': return 'warning';
    case 'medium': return 'info';
    default: return 'default';
  }
}

function TicketCard({
  ticket,
  showAssign,
  onAssign,
}: {
  ticket: Ticket;
  showAssign?: boolean;
  onAssign?: (ticketId: string) => void;
}) {
  const t = useTranslations();
  const tt = t.crmTickets;
  const ta = t.agentDashboard;

  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Typography variant="subtitle2" noWrap sx={{ flex: 1, mr: 1 }}>
            {ticket.subject}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            <Chip
              label={tt?.priority?.[ticket.priority as keyof typeof tt.priority] ?? ticket.priority}
              color={priorityColor(ticket.priority) as any}
              size="small"
              variant="outlined"
            />
            <SlaBadge slaDeadline={ticket.slaDeadline} />
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {tt?.status?.[ticket.status as keyof typeof tt.status] ?? ticket.status}
          {ticket.assignee && ` · ${ticket.assignee.name}`}
          {ticket.contact && ` · ${ticket.contact.displayName}`}
        </Typography>
      </CardContent>
      <CardActions sx={{ pt: 0 }}>
        <Button
          size="small"
          component={NextLink}
          href={`/dashboard/crm/tickets/${ticket.id}`}
        >
          {ta?.viewTicket ?? 'View'}
        </Button>
        {showAssign && onAssign && (
          <Button size="small" onClick={() => onAssign(ticket.id)}>
            {ta?.assignToMe ?? 'Assign to me'}
          </Button>
        )}
      </CardActions>
    </Card>
  );
}

function ColumnSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={100} sx={{ mb: 1 }} />
      ))}
    </>
  );
}

export default function AgentDashboardPage() {
  const t = useTranslations();
  const ta = t.agentDashboard;
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  // Fetch all open/in_progress tickets
  const { data: allTickets, isLoading } = useTickets({ limit: 200 });
  const assignMutation = useAssignTicket();

  const { myTickets, unassigned, slaAtRisk } = useMemo(() => {
    const tickets = allTickets?.data ?? [];
    const activeTickets = tickets.filter(
      (t) => !['resolved', 'closed'].includes(t.status),
    );

    const my = activeTickets.filter((t) => t.assigneeId === userId);
    const un = activeTickets.filter((t) => !t.assigneeId);
    const risk = activeTickets.filter((t) => {
      if (!t.slaDeadline) return false;
      const deadline = new Date(t.slaDeadline).getTime();
      return deadline - Date.now() < TWO_HOURS_MS;
    });

    return { myTickets: my, unassigned: un, slaAtRisk: risk };
  }, [allTickets, userId]);

  const handleAssignToMe = (ticketId: string) => {
    if (!userId) return;
    assignMutation.mutate({ id: ticketId, assigneeId: userId });
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          {ta?.title ?? 'Agent Dashboard'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {ta?.subtitle ?? 'Your tickets and queue overview'}
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {/* My Tickets */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, minHeight: 400 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <UserCheck size={20} />
              <Typography variant="h6">
                {ta?.myTickets ?? 'My Tickets'}
              </Typography>
              <Chip label={myTickets.length} size="small" />
            </Box>
            {isLoading ? (
              <ColumnSkeleton />
            ) : myTickets.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
                {ta?.noTickets ?? 'No tickets'}
              </Typography>
            ) : (
              myTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))
            )}
          </Paper>
        </Grid>

        {/* Unassigned */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, minHeight: 400 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Headset size={20} />
              <Typography variant="h6">
                {ta?.unassigned ?? 'Unassigned'}
              </Typography>
              <Chip label={unassigned.length} size="small" />
            </Box>
            {isLoading ? (
              <ColumnSkeleton />
            ) : unassigned.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
                {ta?.noTickets ?? 'No tickets'}
              </Typography>
            ) : (
              unassigned.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  showAssign
                  onAssign={handleAssignToMe}
                />
              ))
            )}
          </Paper>
        </Grid>

        {/* SLA at Risk */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2, minHeight: 400 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <AlertTriangle size={20} />
              <Typography variant="h6" color="error.main">
                {ta?.slaAtRisk ?? 'SLA at Risk'}
              </Typography>
              <Chip label={slaAtRisk.length} size="small" color="error" />
            </Box>
            {isLoading ? (
              <ColumnSkeleton />
            ) : slaAtRisk.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
                {ta?.noTickets ?? 'No tickets'}
              </Typography>
            ) : (
              slaAtRisk.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

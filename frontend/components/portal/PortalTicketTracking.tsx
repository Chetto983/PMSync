'use client';

import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Divider,
} from '@mui/material';
import { Ticket, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';

interface TicketComment {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
}

interface TrackedTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  comments: TicketComment[];
}

interface PortalTicketTrackingProps {
  tenantSlug: string;
  token: string;
}

const STATUS_STEPS = ['open', 'in_progress', 'resolved', 'closed'];

function getStatusStep(status: string): number {
  const idx = STATUS_STEPS.indexOf(status);
  return idx >= 0 ? idx : 0;
}

function getStatusLabel(status: string, portal?: Record<string, string | undefined>): string {
  switch (status) {
    case 'open': return portal?.statusOpen ?? 'Open';
    case 'in_progress': return portal?.statusInProgress ?? 'In Progress';
    case 'waiting': return 'Waiting';
    case 'resolved': return portal?.statusResolved ?? 'Resolved';
    case 'closed': return portal?.statusClosed ?? 'Closed';
    default: return status;
  }
}

function priorityColor(priority: string) {
  switch (priority) {
    case 'high': return 'warning';
    case 'urgent': return 'error';
    case 'low': return 'default';
    default: return 'info';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function PortalTicketTracking({ tenantSlug, token }: PortalTicketTrackingProps) {
  const t = useTranslations();
  const tp = t.portal;
  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['portal', tenantSlug, 'ticket', token],
    queryFn: () =>
      apiClient
        .get<TrackedTicket>(`/portal/${tenantSlug}/tickets/${token}`)
        .then((r) => r.data),
    staleTime: 60 * 1000,
    retry: 1,
    enabled: !!tenantSlug && !!token,
  });

  if (!tenantSlug || !token) return null;

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 700, mx: 'auto' }}>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="rounded" height={200} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (error || !ticket) {
    return (
      <Box sx={{ maxWidth: 700, mx: 'auto' }}>
        <Alert severity="error">
          {tp?.ticketNotFound ?? 'Ticket not found. Please check your tracking token.'}
        </Alert>
      </Box>
    );
  }

  const activeStep = getStatusStep(ticket.status);

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Ticket size={28} />
        <Typography variant="h5" fontWeight={600}>
          {ticket.subject}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <Chip
          label={getStatusLabel(ticket.status, tp)}
          color={ticket.status === 'resolved' || ticket.status === 'closed' ? 'success' : 'info'}
          size="small"
        />
        <Chip
          label={tp?.[`priority${ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}` as keyof typeof tp] ?? ticket.priority}
          color={priorityColor(ticket.priority) as any}
          size="small"
          variant="outlined"
        />
      </Box>

      {/* Status stepper */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {STATUS_STEPS.map((step) => (
            <Step key={step} completed={STATUS_STEPS.indexOf(step) <= activeStep}>
              <StepLabel>{getStatusLabel(step, tp)}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Dates */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Clock size={16} />
          <Typography variant="body2">
            {tp?.submitted ?? 'Submitted'}: {formatDate(ticket.createdAt)}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 3 }}>
          {tp?.lastUpdated ?? 'Last updated'}: {formatDate(ticket.updatedAt)}
        </Typography>
        {ticket.resolvedAt && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <CheckCircle size={16} color="green" />
            <Typography variant="body2">
              {tp?.resolved ?? 'Resolved'}: {formatDate(ticket.resolvedAt)}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Timeline — only non-internal comments */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
        {tp?.updates ?? 'Updates'}
      </Typography>

      {ticket.comments.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <AlertCircle size={24} />
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            {tp?.noUpdates ?? "No updates yet. We'll respond as soon as possible."}
          </Typography>
        </Paper>
      ) : (
        <Box>
          {ticket.comments.map((comment, i) => (
            <Box key={comment.id}>
              {i > 0 && <Divider sx={{ my: 1 }} />}
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="subtitle2">
                    {comment.author.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(comment.createdAt)}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {comment.body}
                </Typography>
              </Paper>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

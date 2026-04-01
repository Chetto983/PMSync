import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Alert,
  Skeleton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  MenuItem,
} from '@mui/material';
import { Search, Plus } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useTickets } from '@/hooks/queries/use-crm-tickets';
import { CreateTicketDialog } from './CreateTicketDialog';
import type { Ticket } from '@/lib/api/crm-tickets';

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  open: 'primary',
  in_progress: 'warning',
  waiting: 'default',
  resolved: 'success',
  closed: 'error',
};

const PRIORITY_COLORS: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'error',
};

export function TicketsList() {
  const t = useTranslations();
  const tt = t.crmTickets;
  const router = useRouter();
  const q = router.query;

  const [search, setSearch] = useState(() => (typeof q.q === 'string' ? q.q : ''));
  const [statusFilter, setStatusFilter] = useState(() => (typeof q.status === 'string' ? q.status : ''));
  const [priorityFilter, setPriorityFilter] = useState(() => (typeof q.priority === 'string' ? q.priority : ''));
  const [page, setPage] = useState(() => {
    const p = parseInt(typeof q.page === 'string' ? q.page : '', 10);
    return isNaN(p) ? 0 : p;
  });
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (search) params.q = search;
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (page > 0) params.page = String(page);
    router.replace({ pathname: router.pathname, query: params }, undefined, { shallow: true });
  }, [search, statusFilter, priorityFilter, page]);

  const { data, isLoading, isError, error } = useTickets({
    search: search || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 2 }} />
        <Skeleton width="100%" height={48} animation="wave" sx={{ mb: 1 }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={40} animation="wave" sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{(error as Error)?.message ?? tt?.loadError ?? 'Error'}</Alert>
      </Box>
    );
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  const statusLabel = (s: string) =>
    (tt?.status as Record<string, string> | undefined)?.[s] ?? s;
  const priorityLabel = (p: string) =>
    (tt?.priority as Record<string, string> | undefined)?.[p] ?? p;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            {tt?.title ?? 'Tickets'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tt?.subtitle}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateOpen(true)}
        >
          {tt?.newTicket ?? 'New Ticket'}
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder={tt?.search ?? 'Search tickets...'}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 240, flex: 1 }}
        />
        <TextField
          select
          size="small"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          label={tt?.columns?.status ?? 'Status'}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">—</MenuItem>
          {['open', 'in_progress', 'waiting', 'resolved', 'closed'].map((s) => (
            <MenuItem key={s} value={s}>{statusLabel(s)}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(0); }}
          label={tt?.columns?.priority ?? 'Priority'}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">—</MenuItem>
          {['low', 'medium', 'high', 'urgent'].map((p) => (
            <MenuItem key={p} value={p}>{priorityLabel(p)}</MenuItem>
          ))}
        </TextField>
      </Box>

      {/* Table */}
      {rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">{tt?.noTickets ?? 'No tickets found'}</Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            {tt?.noTicketsHint}
          </Typography>
        </Box>
      ) : (
        <>
          <TableContainer sx={{ flex: 1 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>{tt?.columns?.subject ?? 'Subject'}</TableCell>
                  <TableCell>{tt?.columns?.status ?? 'Status'}</TableCell>
                  <TableCell>{tt?.columns?.priority ?? 'Priority'}</TableCell>
                  <TableCell>{tt?.columns?.assignee ?? 'Assignee'}</TableCell>
                  <TableCell>{tt?.columns?.contact ?? 'Contact'}</TableCell>
                  <TableCell>{tt?.columns?.createdAt ?? 'Created'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((ticket: Ticket) => (
                  <TableRow
                    key={ticket.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/dashboard/crm/tickets/${ticket.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 300 }}>
                        {ticket.subject}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={statusLabel(ticket.status)}
                        color={STATUS_COLORS[ticket.status] ?? 'default'}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={priorityLabel(ticket.priority)}
                        color={PRIORITY_COLORS[ticket.priority] ?? 'default'}
                        variant="outlined"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {ticket.assignee?.name ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {ticket.contact?.displayName ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </>
      )}

      <CreateTicketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </Box>
  );
}

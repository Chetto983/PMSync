import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  TextField,
  MenuItem,
  Skeleton,
  Alert,
  Tooltip,
} from '@mui/material';
import { AlertTriangle, Check, Eye, Building2, User } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useChurnAtRisk,
  useAcknowledgeChurn,
} from '@/hooks/queries/use-crm-churn';
import type { ChurnSignal } from '@/lib/api/crm-churn';

const RISK_COLORS: Record<string, 'error' | 'warning' | 'success'> = {
  HIGH: 'error',
  MEDIUM: 'warning',
  LOW: 'success',
};

function getEntityName(signal: ChurnSignal): string {
  if (signal.contact) {
    return (
      signal.contact.displayName ||
      [signal.contact.firstName, signal.contact.lastName]
        .filter(Boolean)
        .join(' ') ||
      'Unknown Contact'
    );
  }
  if (signal.account) {
    return signal.account.name;
  }
  return 'Unknown';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ChurnWarningsList() {
  const t = useTranslations();
  const tc = t.churn;
  const router = useRouter();
  const q = router.query;

  const [page, setPage] = useState(() => {
    const p = parseInt(typeof q.page === 'string' ? q.page : '', 10);
    return isNaN(p) ? 0 : p;
  });
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [riskFilter, setRiskFilter] = useState<string>(() => (typeof q.risk === 'string' ? q.risk : ''));

  useEffect(() => {
    const params: Record<string, string> = {};
    if (riskFilter) params.risk = riskFilter;
    if (page > 0) params.page = String(page);
    router.replace({ pathname: router.pathname, query: params }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskFilter, page]);

  const { data, isLoading, isError } = useChurnAtRisk({
    page: page + 1,
    pageSize: rowsPerPage,
    sort: 'probability',
    order: 'desc',
    riskLevel: riskFilter || undefined,
  });

  const acknowledgeMutation = useAcknowledgeChurn();

  const handleAcknowledge = useCallback(
    (id: string) => {
      acknowledgeMutation.mutate(id);
    },
    [acknowledgeMutation],
  );

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
        <Skeleton width="30%" height={32} animation="wave" sx={{ mb: 1 }} />
        <Skeleton width="50%" height={20} animation="wave" sx={{ mb: 3 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={48}
            animation="wave"
            sx={{ mb: 1 }}
          />
        ))}
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
        <Alert severity="error">Failed to load churn warnings</Alert>
      </Box>
    );
  }

  const signals = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <AlertTriangle size={28} />
          <Typography variant="h5" fontWeight={600}>
            {tc?.title ?? 'Churn Early Warnings'}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {tc?.subtitle ?? 'Contacts and accounts at risk of disengagement'}
        </Typography>
      </Box>

      {/* Filter */}
      <Box sx={{ mb: 2 }}>
        <TextField
          select
          size="small"
          value={riskFilter}
          onChange={(e) => {
            setRiskFilter(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 180 }}
          label={tc?.columns?.riskLevel ?? 'Level'}
        >
          <MenuItem value="">{tc?.filters?.allLevels ?? 'All Risk Levels'}</MenuItem>
          <MenuItem value="HIGH">{tc?.riskLevels?.HIGH ?? 'High'}</MenuItem>
          <MenuItem value="MEDIUM">{tc?.riskLevels?.MEDIUM ?? 'Medium'}</MenuItem>
          <MenuItem value="LOW">{tc?.riskLevels?.LOW ?? 'Low'}</MenuItem>
        </TextField>
      </Box>

      {/* Table */}
      {signals.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            textAlign: 'center',
          }}
        >
          <Typography color="text.secondary">
            {tc?.empty ?? 'No churn warnings found'}
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            {tc?.emptyDescription ??
              'All contacts and accounts are showing healthy engagement.'}
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  {tc?.columns?.entity ?? 'Contact / Account'}
                </TableCell>
                <TableCell align="center">
                  {tc?.columns?.riskLevel ?? 'Level'}
                </TableCell>
                <TableCell align="center">
                  {tc?.columns?.probability ?? 'Risk'}
                </TableCell>
                <TableCell>
                  {tc?.columns?.reasoning ?? 'Assessment'}
                </TableCell>
                <TableCell>
                  {tc?.columns?.lastInteraction ?? 'Last Interaction'}
                </TableCell>
                <TableCell>
                  {tc?.columns?.computedAt ?? 'Assessed'}
                </TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {signals.map((signal) => (
                <TableRow key={signal.id} hover>
                  <TableCell>
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                    >
                      {signal.contactId ? (
                        <User size={16} />
                      ) : (
                        <Building2 size={16} />
                      )}
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {getEntityName(signal)}
                        </Typography>
                        {signal.contact?.company && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {signal.contact.company}
                          </Typography>
                        )}
                        {signal.account?.industry && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {signal.account.industry}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={
                        tc?.riskLevels?.[
                          signal.riskLevel as keyof typeof tc.riskLevels
                        ] ?? signal.riskLevel
                      }
                      color={RISK_COLORS[signal.riskLevel] ?? 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={
                        signal.probability > 0.7
                          ? 'error.main'
                          : signal.probability > 0.4
                            ? 'warning.main'
                            : 'text.secondary'
                      }
                    >
                      {(signal.probability * 100).toFixed(0)}%
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        maxWidth: 280,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {signal.reasoning || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {signal.contact?.lastInteractedAt
                        ? formatDate(signal.contact.lastInteractedAt)
                        : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(signal.computedAt)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip
                      title={tc?.actions?.acknowledge ?? 'Dismiss'}
                    >
                      <IconButton
                        size="small"
                        onClick={() => handleAcknowledge(signal.id)}
                        disabled={acknowledgeMutation.isPending}
                        aria-label={tc?.actions?.acknowledge ?? 'Dismiss'}
                        sx={{ minWidth: 44, minHeight: 44 }}
                      >
                        <Check size={16} />
                      </IconButton>
                    </Tooltip>
                    {signal.contactId && (
                      <Tooltip
                        title={tc?.actions?.viewContact ?? 'View Contact'}
                      >
                        <IconButton
                          size="small"
                          component="a"
                          href={`/dashboard/contacts/${signal.contactId}`}
                          aria-label={tc?.actions?.viewContact ?? 'View Contact'}
                          sx={{ minWidth: 44, minHeight: 44 }}
                        >
                          <Eye size={16} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </TableContainer>
      )}
    </Box>
  );
}

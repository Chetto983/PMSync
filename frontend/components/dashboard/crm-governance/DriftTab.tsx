'use client';

import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Alert,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
} from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useGovernanceDrift,
  useRunDriftCheck,
} from '@/hooks/queries/use-crm-governance';

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  stable: 'success',
  warning: 'warning',
  critical: 'error',
};

export function DriftTab() {
  const t = useTranslations();
  const tg = t.aiGovernance;
  const td = tg?.drift;

  const { data, isLoading, error } = useGovernanceDrift();
  const runCheck = useRunDriftCheck();

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} />
      </Paper>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load drift data</Alert>;
  }

  return (
    <Box>
      {/* Header with Run Check button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle2" fontWeight={600}>
            {td?.title ?? 'Data Drift Detection'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {td?.subtitle ?? 'Population Stability Index (PSI) for model features'}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<RefreshCw size={14} />}
          onClick={() => runCheck.mutate()}
          disabled={runCheck.isPending}
        >
          {runCheck.isPending ? 'Checking...' : 'Run Check'}
        </Button>
      </Box>

      {runCheck.isPending && <LinearProgress sx={{ mb: 2 }} />}

      {!data || data.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {td?.noData ?? 'No drift data available yet'}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
            Click &quot;Run Check&quot; to analyze feature distributions
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{td?.feature ?? 'Feature'}</TableCell>
                  <TableCell align="right">{td?.psi ?? 'PSI Score'}</TableCell>
                  <TableCell>{td?.status ?? 'Status'}</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>PSI</TableCell>
                  <TableCell align="right">Baseline N</TableCell>
                  <TableCell align="right">Current N</TableCell>
                  <TableCell>{td?.lastChecked ?? 'Last Checked'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.feature}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                        {row.feature}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        color={
                          row.status === 'critical'
                            ? 'error.main'
                            : row.status === 'warning'
                              ? 'warning.main'
                              : 'text.primary'
                        }
                      >
                        {row.psi.toFixed(3)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={
                          td?.[row.status as keyof typeof td] ??
                          row.status.charAt(0).toUpperCase() + row.status.slice(1)
                        }
                        size="small"
                        color={STATUS_COLOR[row.status] ?? 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(row.psi * 500, 100)}
                          sx={{ flex: 1, height: 6, borderRadius: 3 }}
                          color={STATUS_COLOR[row.status] ?? 'primary'}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="right">{row.baselineN}</TableCell>
                    <TableCell align="right">{row.currentN}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(row.checkedAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}

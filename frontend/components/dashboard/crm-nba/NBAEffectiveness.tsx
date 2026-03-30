'use client';

import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Chip,
} from '@mui/material';
import { BarChart3 } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useNbaEffectiveness } from '@/hooks/queries/use-crm-nba';
import type { NBAActionType } from '@/lib/api/crm-nba';

export function NBAEffectiveness() {
  const t = useTranslations();
  const tn = t.nba;
  const te = tn?.effectiveness;

  const { data, isLoading, error } = useNbaEffectiveness();

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 2 }} />
        <Skeleton width="100%" height={40} />
        <Skeleton width="100%" height={40} />
        <Skeleton width="100%" height={40} />
      </Paper>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <BarChart3 size={16} />
          <Typography variant="subtitle2" fontWeight={600}>
            {te?.title ?? 'Action Effectiveness'}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {tn?.empty ?? 'No data available'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <BarChart3 size={16} />
        <Typography variant="subtitle2" fontWeight={600}>
          {te?.title ?? 'Action Effectiveness'}
        </Typography>
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{tn?.actionTypes?.EMAIL ? 'Type' : 'Type'}</TableCell>
              <TableCell align="right">
                {te?.suggested ?? 'Suggested'}
              </TableCell>
              <TableCell align="right">
                {te?.accepted ?? 'Accepted'}
              </TableCell>
              <TableCell align="right">
                {te?.executed ?? 'Executed'}
              </TableCell>
              <TableCell align="right">
                {te?.dismissed ?? 'Dismissed'}
              </TableCell>
              <TableCell sx={{ minWidth: 140 }}>
                {te?.acceptanceRate ?? 'Acceptance'}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.actionType}>
                <TableCell>
                  <Chip
                    label={
                      tn?.actionTypes?.[row.actionType as NBAActionType] ??
                      row.actionType
                    }
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell align="right">{row.suggested}</TableCell>
                <TableCell align="right">{row.accepted}</TableCell>
                <TableCell align="right">{row.executed}</TableCell>
                <TableCell align="right">{row.dismissed}</TableCell>
                <TableCell>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <LinearProgress
                      variant="determinate"
                      value={row.acceptanceRate}
                      sx={{ flex: 1, height: 6, borderRadius: 3 }}
                      color={
                        row.acceptanceRate >= 60
                          ? 'success'
                          : row.acceptanceRate >= 30
                            ? 'warning'
                            : 'error'
                      }
                    />
                    <Typography variant="caption" sx={{ minWidth: 32 }}>
                      {row.acceptanceRate}%
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

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
  Snackbar,
} from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useGovernanceModels,
  useTriggerRetrain,
} from '@/hooks/queries/use-crm-governance';

export function ModelsTab() {
  const t = useTranslations();
  const tg = t.aiGovernance;
  const tm = tg?.models;

  const { data, isLoading, error } = useGovernanceModels();
  const retrain = useTriggerRetrain();
  const [snackMsg, setSnackMsg] = React.useState('');

  const handleRetrain = (modelType: string) => {
    retrain.mutate(modelType, {
      onSuccess: () => setSnackMsg(tm?.retrainStarted ?? 'Retraining started'),
      onError: () => setSnackMsg(tm?.retrainFailed ?? 'Failed to start retraining'),
    });
  };

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} />
      </Paper>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load model registry</Alert>;
  }

  if (!data || data.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {tm?.noData ?? 'No models registered yet'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {tm?.title ?? 'Model Registry'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {tm?.subtitle ?? 'Active AI models with retraining controls'}
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tm?.modelName ?? 'Model'}</TableCell>
                <TableCell>{tm?.version ?? 'Version'}</TableCell>
                <TableCell>{tm?.status ?? 'Status'}</TableCell>
                <TableCell>{tm?.accuracy ?? 'Accuracy'}</TableCell>
                <TableCell>{tm?.lastTrained ?? 'Last Trained'}</TableCell>
                <TableCell align="right">{tm?.actions ?? 'Actions'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((model) => (
                <TableRow key={model.modelType}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {model.modelType}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                      {model.version}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={model.isActive ? (tm?.enabled ?? 'Enabled') : (tm?.disabled ?? 'Disabled')}
                      size="small"
                      color={model.isActive ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {model.accuracy != null ? (
                      <Typography variant="body2">
                        {(model.accuracy * 100).toFixed(1)}%
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(model.lastTrained).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<RefreshCw size={14} />}
                      onClick={() => handleRetrain(model.modelType)}
                      disabled={retrain.isPending}
                    >
                      {tm?.retrain ?? 'Retrain'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
      />
    </Box>
  );
}

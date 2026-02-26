import React from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
  Alert,
  Skeleton,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import { Download, FileArchive, Clock } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useDataExports, useExportMutation } from '@/hooks/queries';
import { complianceApi, type DataExportResponse, type DataExportStatus } from '@/lib/api/compliance';
import { SectionCard } from '@/components/settings/SectionCard';

function getStatusColor(status: DataExportStatus): 'info' | 'warning' | 'success' | 'default' | 'error' {
  switch (status) {
    case 'PENDING':
      return 'info';
    case 'PROCESSING':
      return 'warning';
    case 'READY':
      return 'success';
    case 'EXPIRED':
      return 'default';
    case 'FAILED':
      return 'error';
    default:
      return 'default';
  }
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function DataExportPanel() {
  const t = useTranslations();
  const copy = t.settings.dataRights?.export;
  const { data: exports, isLoading, error } = useDataExports();
  const exportMutation = useExportMutation();

  const exportList = Array.isArray(exports) ? exports : [];
  const hasPendingExport = exportList.some(
    (e: DataExportResponse) => e.status === 'PENDING' || e.status === 'PROCESSING',
  );

  const handleDownload = async (id: string) => {
    try {
      const blob = await complianceApi.downloadExport(id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `data-export-${id}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      // Download error silently handled
    }
  };

  if (isLoading) {
    return (
      <SectionCard title={copy?.title || 'Export Your Data'}>
        <Skeleton variant="text" width="80%" height={20} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ mb: 1, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title={copy?.title || 'Export Your Data'}>
        <Alert severity="error">{t.common.genericError}</Alert>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={copy?.title || 'Export Your Data'}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {copy?.description}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
        {copy?.includes}
      </Typography>

      <Button
        variant="contained"
        startIcon={<FileArchive size={18} />}
        onClick={() => exportMutation.mutate()}
        disabled={exportMutation.isPending || !!hasPendingExport}
        sx={{ mb: 2 }}
      >
        {copy?.requestButton}
      </Button>

      {exportMutation.isSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {copy?.requestSuccess}
        </Alert>
      )}

      {exportMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t.common.genericError}
        </Alert>
      )}

      {exportList.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          {copy?.noExports}
        </Typography>
      ) : (
        <List disablePadding>
          {exportList.map((exp: DataExportResponse, index: number) => (
            <React.Fragment key={exp.id}>
              {index > 0 && <Divider />}
              <ListItem
                disablePadding
                sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={copy?.status?.[exp.status] || exp.status}
                        color={getStatusColor(exp.status)}
                        size="small"
                        variant="outlined"
                      />
                      {exp.status === 'READY' && exp.fileSize && (
                        <Typography variant="caption" color="text.secondary">
                          {copy?.fileSize}: {formatFileSize(exp.fileSize)}
                        </Typography>
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <Clock size={14} />
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(exp.createdAt)}
                      </Typography>
                      {exp.status === 'READY' && exp.expiresAt && (
                        <Typography variant="caption" color="text.secondary">
                          {' '}| {copy?.expiresAt}: {formatDate(exp.expiresAt)}
                        </Typography>
                      )}
                    </Box>
                  }
                />
                {exp.status === 'READY' && (
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<Download size={16} />}
                    onClick={() => handleDownload(exp.id)}
                  >
                    {copy?.downloadButton}
                  </Button>
                )}
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      )}
    </SectionCard>
  );
}

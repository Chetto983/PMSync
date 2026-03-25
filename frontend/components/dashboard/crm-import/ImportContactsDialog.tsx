import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  TextField,
  MenuItem,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Paper,
} from '@mui/material';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  crmImportExportApi,
  type ColumnMapping,
  type ImportPreviewResponse,
} from '@/lib/api/crm-import-export';

interface ImportContactsDialogProps {
  open: boolean;
  onClose: () => void;
}

const TARGET_FIELDS = [
  'skip',
  'firstName',
  'lastName',
  'displayName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'department',
  'notes',
  'tags',
] as const;

export function ImportContactsDialog({ open, onClose }: ImportContactsDialogProps) {
  const t = useTranslations();
  const tie = t.crmImportExport;

  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importStarted, setImportStarted] = useState(false);

  const steps = [
    tie?.steps?.upload ?? 'Upload',
    tie?.steps?.map ?? 'Map',
    tie?.steps?.preview ?? 'Preview',
    tie?.steps?.import ?? 'Import',
  ];

  const fieldLabels: Record<string, string> = {
    skip: tie?.skip ?? 'Skip',
    firstName: tie?.fieldTargets?.firstName ?? 'First Name',
    lastName: tie?.fieldTargets?.lastName ?? 'Last Name',
    displayName: tie?.fieldTargets?.displayName ?? 'Display Name',
    email: tie?.fieldTargets?.email ?? 'Email',
    phone: tie?.fieldTargets?.phone ?? 'Phone',
    company: tie?.fieldTargets?.company ?? 'Company',
    jobTitle: tie?.fieldTargets?.jobTitle ?? 'Job Title',
    department: tie?.fieldTargets?.department ?? 'Department',
    notes: tie?.fieldTargets?.notes ?? 'Notes',
    tags: tie?.fieldTargets?.tags ?? 'Tags',
  };

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setLoading(true);
    try {
      const result = await crmImportExportApi.parseHeaders(selectedFile);
      setHeaders(result.headers);
      // Auto-map: try matching header names to field names
      const autoMappings: ColumnMapping[] = result.headers.map((h) => {
        const lower = h.toLowerCase().replace(/[_\s-]/g, '');
        const match = TARGET_FIELDS.find(
          (f) => f.toLowerCase() === lower || lower.includes(f.toLowerCase()),
        );
        return { source: h, target: match ?? 'skip' };
      });
      setMappings(autoMappings);
      setActiveStep(1);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await crmImportExportApi.previewImport(file, mappings);
      setPreview(result);
      setActiveStep(2);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Preview failed');
    } finally {
      setLoading(false);
    }
  }, [file, mappings]);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      await crmImportExportApi.importContacts(file, mappings);
      setImportStarted(true);
      setActiveStep(3);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Import failed');
    } finally {
      setLoading(false);
    }
  }, [file, mappings]);

  const handleClose = () => {
    setActiveStep(0);
    setFile(null);
    setHeaders([]);
    setMappings([]);
    setPreview(null);
    setError(null);
    setImportStarted(false);
    onClose();
  };

  const updateMapping = (index: number, target: string) => {
    setMappings((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], target };
      return next;
    });
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{tie?.importContacts ?? 'Import Contacts'}</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3, mt: 1 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Step 0: Upload */}
        {activeStep === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <FileSpreadsheet size={48} style={{ opacity: 0.4, marginBottom: 16 }} />
            <Typography variant="body1" sx={{ mb: 2 }}>
              {tie?.uploadDescription ?? 'Select a CSV file to import contacts.'}
            </Typography>
            <Button
              variant="contained"
              component="label"
              startIcon={<Upload size={18} />}
            >
              {file ? (tie?.changeFile ?? 'Change File') : (tie?.selectFile ?? 'Select File')}
              <input
                type="file"
                accept=".csv,.txt"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFileSelect(f);
                }}
              />
            </Button>
            {file && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </Typography>
            )}
          </Box>
        )}

        {/* Step 1: Map columns */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {tie?.mapColumnsDescription ?? 'Match CSV columns to contact fields.'}
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{tie?.csvColumn ?? 'CSV Column'}</TableCell>
                    <TableCell>{tie?.contactField ?? 'Contact Field'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {headers.map((header, i) => (
                    <TableRow key={header}>
                      <TableCell>{header}</TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={mappings[i]?.target ?? 'skip'}
                          onChange={(e) => updateMapping(i, e.target.value)}
                        >
                          {TARGET_FIELDS.map((f) => (
                            <MenuItem key={f} value={f}>
                              {fieldLabels[f] ?? f}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Step 2: Preview */}
        {activeStep === 2 && preview && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {tie?.previewDescription ?? 'Review the first 5 rows before importing.'}
              {' '}
              {(tie?.rowsToImport ?? '{count} rows will be imported').replace('{count}', String(preview.totalRows))}
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {mappings.filter((m) => m.target !== 'skip').map((m) => (
                      <TableCell key={m.source}>{fieldLabels[m.target] ?? m.target}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.preview.map((row, i) => (
                    <TableRow key={i}>
                      {mappings.filter((m) => m.target !== 'skip').map((m) => (
                        <TableCell key={m.source}>{row[m.target] ?? ''}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Step 3: Import started */}
        {activeStep === 3 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            {importStarted ? (
              <>
                <Typography variant="body1" color="success.main" sx={{ mb: 1 }}>
                  {tie?.importStarted ?? 'Import started. You can track progress in real-time.'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Socket.IO event: crm:import:progress
                </Typography>
              </>
            ) : (
              <Typography variant="body1" color="error.main">
                {tie?.importFailed ?? 'Import failed.'}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.common?.cancel ?? 'Cancel'}</Button>
        {activeStep === 1 && (
          <Button
            variant="contained"
            onClick={handlePreview}
            disabled={loading || mappings.every((m) => m.target === 'skip')}
          >
            {tie?.preview ?? 'Preview'}
          </Button>
        )}
        {activeStep === 2 && (
          <>
            <Button onClick={() => setActiveStep(1)}>
              {'Back'}
            </Button>
            <Button variant="contained" onClick={handleImport} disabled={loading}>
              {tie?.confirm ?? 'Confirm Import'}
            </Button>
          </>
        )}
        {activeStep === 3 && (
          <Button variant="contained" onClick={handleClose}>
            {t.common?.close ?? 'Close'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

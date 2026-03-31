import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import { Upload, FileText, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useImportFromVCard } from '@/hooks/queries/use-contacts';
import { contactsApi } from '@/lib/api/contacts';
import type { VCardImportResult, SenderContactMap } from '@/lib/api/contacts';

interface VCardImportDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ParsedContact {
  name: string;
  email: string;
  phone: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Parse vCard content into preview-able contact entries.
 * Lightweight client-side parser — real import happens on backend.
 */
function parseVCardPreview(content: string): ParsedContact[] {
  const contacts: ParsedContact[] = [];
  const blocks = content.split(/(?=BEGIN:VCARD)/i);

  for (const block of blocks) {
    if (!block.trim() || !/BEGIN:VCARD/i.test(block)) continue;

    let name = '';
    let email = '';
    let phone = '';

    const lines = block.split(/\r?\n/);
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.startsWith('FN:') || upper.startsWith('FN;')) {
        name = line.replace(/^FN[;:][^:]*/i, '').replace(/^:/, '').trim();
      } else if (!name && (upper.startsWith('N:') || upper.startsWith('N;'))) {
        const raw = line.replace(/^N[;:][^:]*/i, '').replace(/^:/, '').trim();
        const parts = raw.split(';').filter(Boolean);
        name = parts.length >= 2 ? `${parts[1]} ${parts[0]}` : parts[0] || '';
      } else if (!email && (upper.startsWith('EMAIL:') || upper.startsWith('EMAIL;'))) {
        email = line.replace(/^EMAIL[;:][^:]*/i, '').replace(/^:/, '').trim();
      } else if (!phone && (upper.startsWith('TEL:') || upper.startsWith('TEL;'))) {
        phone = line.replace(/^TEL[;:][^:]*/i, '').replace(/^:/, '').trim();
      }
    }

    if (name || email) {
      contacts.push({ name: name || '(no name)', email, phone });
    }
  }

  return contacts;
}

type Step = 'select' | 'preview' | 'importing' | 'done';

export function VCardImportDialog({ open, onClose }: VCardImportDialogProps) {
  const theme = useTheme();
  const t = useTranslations();
  const iv = t.contacts?.importVCard;

  const importMutation = useImportFromVCard();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VCardImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [duplicates, setDuplicates] = useState<SenderContactMap>({});
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const parsedContacts = useMemo(
    () => (fileContent ? parseVCardPreview(fileContent) : []),
    [fileContent],
  );

  const resetState = useCallback(() => {
    setStep('select');
    setFile(null);
    setFileContent('');
    setError(null);
    setResult(null);
    setDragOver(false);
    setDuplicates({});
    setCheckingDuplicates(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const validateAndReadFile = useCallback(
    (f: File) => {
      setError(null);

      if (!f.name.toLowerCase().endsWith('.vcf')) {
        setError(iv?.invalidFile ?? 'Invalid file. Please select a .vcf file.');
        return;
      }
      if (f.size === 0) {
        setError(iv?.emptyFile ?? 'The file is empty.');
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        setError(iv?.fileTooLarge ?? 'File is too large. Maximum 5 MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setFileContent(text);
        setFile(f);

        const contacts = parseVCardPreview(text);
        if (contacts.length === 0) {
          setError(iv?.noContacts ?? 'No contacts found in this file.');
          return;
        }
        setStep('preview');
      };
      reader.onerror = () => {
        setError(iv?.invalidFile ?? 'Invalid file. Please select a .vcf file.');
      };
      reader.readAsText(f);
    },
    [iv],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) validateAndReadFile(f);
      // Reset input so re-selecting the same file triggers change
      if (e.target) e.target.value = '';
    },
    [validateAndReadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) validateAndReadFile(f);
    },
    [validateAndReadFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  // Check for duplicates when preview step is reached
  const duplicateCount = Object.keys(duplicates).length;

  useEffect(() => {
    if (step !== 'preview' || parsedContacts.length === 0) return;

    const emails = parsedContacts
      .map((c) => c.email)
      .filter(Boolean);

    if (emails.length === 0) return;

    let cancelled = false;
    setCheckingDuplicates(true);

    contactsApi
      .lookupByEmails(emails)
      .then((map) => {
        if (!cancelled) setDuplicates(map);
      })
      .catch(() => {
        // Non-critical — proceed without duplicate info
      })
      .finally(() => {
        if (!cancelled) setCheckingDuplicates(false);
      });

    return () => {
      cancelled = true;
    };
  }, [step, parsedContacts]);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setStep('importing');
    setError(null);

    try {
      const res = await importMutation.mutateAsync({ file });
      setResult(res);
      setStep('done');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : (iv?.importFailed ?? 'Import failed.');
      setError(msg);
      setStep('preview');
    }
  }, [file, importMutation, iv]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{iv?.title ?? 'Import vCard'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Step: Select file (drop zone) */}
        {step === 'select' && (
          <Box
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: '2px dashed',
              borderColor: dragOver
                ? 'primary.main'
                : alpha(theme.palette.text.secondary, 0.3),
              borderRadius: 2,
              p: 5,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: dragOver
                ? alpha(theme.palette.primary.main, 0.04)
                : 'transparent',
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: alpha(theme.palette.primary.main, 0.02),
              },
            }}
          >
            <Upload
              size={40}
              style={{ opacity: 0.4, marginBottom: 12 }}
            />
            <Typography variant="body1" sx={{ mb: 1 }}>
              {dragOver
                ? (iv?.dropzoneActive ?? 'Drop the file here…')
                : (iv?.dropzone ?? 'Drag & drop a .vcf file here, or click to browse')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              .vcf — vCard 3.0 / 4.0
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vcf"
              hidden
              onChange={handleFileChange}
            />
          </Box>
        )}

        {/* Step: Preview parsed contacts */}
        {step === 'preview' && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <FileText size={18} />
              <Typography variant="body2" color="text.secondary">
                {(iv?.previewDescription ?? '{count} contact(s) found in file').replace(
                  '{count}',
                  String(parsedContacts.length),
                )}
              </Typography>
              {file && (
                <Chip
                  label={file.name}
                  size="small"
                  variant="outlined"
                  onDelete={() => {
                    resetState();
                  }}
                />
              )}
            </Box>

            {/* Duplicate warning */}
            {checkingDuplicates && (
              <LinearProgress sx={{ mb: 1 }} />
            )}
            {!checkingDuplicates && duplicateCount > 0 && (
              <Alert
                severity="warning"
                icon={<AlertCircle size={18} />}
                sx={{ mb: 2 }}
              >
                {(iv?.duplicatesFound ?? '{count} possible duplicate(s) found. They will be skipped by the server.').replace(
                  '{count}',
                  String(duplicateCount),
                )}
              </Alert>
            )}

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ maxHeight: 300 }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{iv?.name ?? 'Name'}</TableCell>
                    <TableCell>{iv?.email ?? 'Email'}</TableCell>
                    <TableCell>{iv?.phone ?? 'Phone'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedContacts.slice(0, 50).map((c, i) => {
                    const isDuplicate = !!(c.email && duplicates[c.email.toLowerCase()]);
                    return (
                      <TableRow
                        key={i}
                        sx={isDuplicate ? {
                          bgcolor: alpha(theme.palette.warning.main, 0.06),
                        } : undefined}
                      >
                        <TableCell>{c.name}</TableCell>
                        <TableCell>
                          {c.email || '—'}
                          {isDuplicate && (
                            <Chip
                              label={iv?.duplicate ?? 'Duplicate'}
                              size="small"
                              color="warning"
                              sx={{ ml: 1, height: 18, fontSize: '0.65rem' }}
                            />
                          )}
                        </TableCell>
                        <TableCell>{c.phone || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {parsedContacts.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        <Typography variant="caption" color="text.secondary">
                          +{parsedContacts.length - 50} more
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography variant="body1">
              {iv?.importing ?? 'Importing…'}
            </Typography>
          </Box>
        )}

        {/* Step: Done */}
        {step === 'done' && result && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            {result.success ? (
              <>
                <CheckCircle
                  size={48}
                  style={{ color: theme.palette.success.main, marginBottom: 12 }}
                />
                <Typography variant="body1" color="success.main" sx={{ mb: 0.5 }}>
                  {(iv?.success ?? 'Successfully imported {imported} contact(s).').replace(
                    '{imported}',
                    String(result.imported),
                  )}
                </Typography>
                {result.skipped > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {(iv?.skipped ?? '{skipped} skipped.').replace(
                      '{skipped}',
                      String(result.skipped),
                    )}
                  </Typography>
                )}
              </>
            ) : (
              <>
                <AlertTriangle
                  size={48}
                  style={{ color: theme.palette.warning.main, marginBottom: 12 }}
                />
                <Typography variant="body1" color="warning.main">
                  {result.message}
                </Typography>
              </>
            )}
            {result.errors.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2, textAlign: 'left' }}>
                {(iv?.errors ?? '{count} error(s) occurred.').replace(
                  '{count}',
                  String(result.errors.length),
                )}
                <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>
                      <Typography variant="caption">{err}</Typography>
                    </li>
                  ))}
                </Box>
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          {step === 'done'
            ? (t.common?.close ?? 'Close')
            : (t.common?.cancel ?? 'Cancel')}
        </Button>
        {step === 'preview' && (
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={importMutation.isPending}
          >
            {iv?.button ?? 'Import vCard'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default VCardImportDialog;

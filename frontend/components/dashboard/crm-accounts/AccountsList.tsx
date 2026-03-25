import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Alert,
  Skeleton,
  IconButton,
  Tooltip,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
} from '@mui/material';
import { Search, Plus, Trash2, ExternalLink, Download } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAccounts, useDeleteAccount } from '@/hooks/queries/use-crm-accounts';
import { crmImportExportApi } from '@/lib/api/crm-import-export';
import { CreateAccountDialog } from './CreateAccountDialog';
import type { CrmAccount } from '@/lib/api/crm-accounts';

export function AccountsList() {
  const t = useTranslations();
  const ta = t.crmAccounts;
  const tc = t.common;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error } = useAccounts({
    search: search || undefined,
    limit: rowsPerPage,
    offset: page * rowsPerPage,
  });

  const router = useRouter();
  const deleteAccount = useDeleteAccount();

  const handleDelete = (id: string) => {
    if (window.confirm(ta?.deleteConfirm ?? 'Delete?')) {
      deleteAccount.mutate(id);
    }
  };

  // Loading state
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

  // Error state
  if (isError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{(error as Error)?.message ?? 'Error loading accounts'}</Alert>
      </Box>
    );
  }

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            {ta?.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ta?.description}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Download size={18} />}
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await crmImportExportApi.exportAccountsXlsx({ search: search || undefined });
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? (ta?.exporting ?? 'Exporting...') : (ta?.exportXlsx ?? 'Export')}
          </Button>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
          >
            {ta?.newAccount}
          </Button>
        </Box>
      </Box>

      {/* Search */}
      <TextField
        placeholder={ta?.searchPlaceholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        size="small"
        sx={{ mb: 2, maxWidth: 360 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={18} />
              </InputAdornment>
            ),
          },
        }}
      />

      {/* Empty state */}
      {rows.length === 0 && !search ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {ta?.noAccountsFound}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {ta?.noAccountsDescription}
          </Typography>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
          >
            {ta?.newAccount}
          </Button>
        </Box>
      ) : (
        <>
          <TableContainer sx={{ flex: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{ta?.columns?.name ?? 'Name'}</TableCell>
                  <TableCell>{ta?.columns?.website ?? 'Website'}</TableCell>
                  <TableCell>{ta?.columns?.industry ?? 'Industry'}</TableCell>
                  <TableCell>{ta?.columns?.size ?? 'Size'}</TableCell>
                  <TableCell align="center">{ta?.columns?.contacts ?? 'Contacts'}</TableCell>
                  <TableCell align="center">{ta?.columns?.deals ?? 'Deals'}</TableCell>
                  <TableCell width={50} />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((account: CrmAccount) => (
                  <TableRow
                    key={account.id}
                    hover
                    onClick={() => router.push(`/dashboard/crm/accounts/${account.id}`)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500} color="primary">
                        {account.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {account.website ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                            {account.website}
                          </Typography>
                          <ExternalLink size={14} />
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {account.industry ? (
                        <Chip
                          label={ta?.industries?.[account.industry as keyof NonNullable<typeof ta.industries>] ?? account.industry}
                          size="small"
                          variant="outlined"
                        />
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {account.size
                          ? (ta?.sizes?.[account.size as keyof NonNullable<typeof ta.sizes>] ?? account.size)
                          : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">{account._count?.contacts ?? 0}</TableCell>
                    <TableCell align="center">{account._count?.deals ?? 0}</TableCell>
                    <TableCell>
                      <Tooltip title={ta?.deleteAccount ?? 'Delete'}>
                        <IconButton size="small" onClick={() => handleDelete(account.id)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && search && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">{ta?.noAccountsFound}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
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
            rowsPerPageOptions={[10, 25, 50]}
            labelRowsPerPage={tc?.rowsPerPage ?? 'Rows per page:'}
            labelDisplayedRows={({ from, to, count }) =>
              (tc?.displayedRows ?? '{from}-{to} of {count}')
                .replace('{from}', String(from))
                .replace('{to}', String(to))
                .replace('{count}', count !== -1 ? String(count) : `more than ${to}`)
            }
          />
        </>
      )}

      <CreateAccountDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  );
}

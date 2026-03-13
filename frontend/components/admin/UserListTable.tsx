import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  Paper,
  Card,
  CardContent,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import DevicesIcon from '@mui/icons-material/Devices';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useAdminUsers, useImpersonateUser, useUnbanUser } from '@/hooks/queries/use-admin';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import { BanUserDialog } from './BanUserDialog';
import { UserSessionsDialog } from './UserSessionsDialog';

/** Debounce helper */
function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function UserListTable() {
  const t = useTranslations();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { data: session } = authClient.useSession();
  const currentUser = session?.user as SessionUser | undefined;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(25);
  const debouncedSearch = useDebounce(search, 300);

  // Dialog state
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [sessionsTarget, setSessionsTarget] = useState<{ id: string; name: string } | null>(null);

  const params = useMemo(() => ({
    limit: rowsPerPage,
    offset: page * rowsPerPage,
    searchValue: debouncedSearch || undefined,
    searchField: debouncedSearch ? 'email' : undefined,
    searchOperator: debouncedSearch ? 'contains' : undefined,
  }), [rowsPerPage, page, debouncedSearch]);

  const { data, isLoading } = useAdminUsers(params);
  const impersonate = useImpersonateUser();
  const unbanUser = useUnbanUser();

  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  const handleImpersonate = useCallback((userId: string) => {
    if (window.confirm('Start impersonating this user?')) {
      impersonate.mutate(userId);
    }
  }, [impersonate]);

  const formatDate = (date: string | Date) => {
    try { return new Date(date).toLocaleDateString(); }
    catch { return '-'; }
  };

  const renderActions = (user: any) => {
    const isSelf = user.id === currentUser?.id;
    const isBanned = !!user.banned;
    return (
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {!isSelf && (
          <>
            {isBanned ? (
              <Tooltip title={t.admin?.users.unban}>
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => unbanUser.mutate(user.id)}
                  disabled={unbanUser.isPending}
                >
                  <LockOpenIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title={t.admin?.users.ban}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setBanTarget({ id: user.id, name: user.name || user.email })}
                >
                  <BlockIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t.admin?.users.impersonate}>
              <IconButton
                size="small"
                onClick={() => handleImpersonate(user.id)}
                disabled={impersonate.isPending}
              >
                <PersonSearchIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title={t.admin?.users.sessions}>
          <IconButton
            size="small"
            onClick={() => setSessionsTarget({ id: user.id, name: user.name || user.email })}
          >
            <DevicesIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  const renderMobileCards = () => {
    if (isLoading) {
      return (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t.common?.loading}
        </Typography>
      );
    }
    if (users.length === 0) {
      return (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {t.admin?.users.noUsers}
        </Typography>
      );
    }
    return users.map((user: any) => {
      const isBanned = !!user.banned;
      return (
        <Card key={user.id} variant="outlined" sx={{ mb: 1.5 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>
                  {user.name || '-'}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {user.email}
                </Typography>
              </Box>
              {renderActions(user)}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, flexWrap: 'wrap' }}>
              <Chip label={user.role || 'user'} size="small" variant="outlined" />
              <Chip
                label={isBanned ? t.admin?.users.banned : t.admin?.users.active}
                size="small"
                color={isBanned ? 'error' : 'success'}
              />
              {user.twoFactorEnabled && (
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                  label={t.admin?.users.columns.twoFactor}
                  size="small"
                  color="success"
                  variant="outlined"
                />
              )}
              {user.emailVerified && (
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                  label={t.admin?.users.columns.verified}
                  size="small"
                  color="info"
                  variant="outlined"
                />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {t.admin?.users.columns.created}: {formatDate(user.createdAt)}
            </Typography>
          </CardContent>
        </Card>
      );
    });
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 1,
          mb: 2,
        }}
      >
        <Typography variant="h5">{t.admin?.users.title}</Typography>
        <TextField
          size="small"
          placeholder={t.admin?.users.searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ width: { xs: '100%', sm: 300 } }}
        />
      </Box>

      {isMobile ? (
        <Box>{renderMobileCards()}</Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t.admin?.users.columns.name}</TableCell>
                <TableCell>{t.admin?.users.columns.email}</TableCell>
                <TableCell>{t.admin?.users.columns.role}</TableCell>
                <TableCell>{t.admin?.users.columns.status}</TableCell>
                <TableCell align="center">{t.admin?.users.columns.twoFactor}</TableCell>
                <TableCell align="center">{t.admin?.users.columns.verified}</TableCell>
                <TableCell>{t.admin?.users.columns.created}</TableCell>
                <TableCell>{t.admin?.users.columns.actions}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t.common?.loading}</Typography>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">{t.admin?.users.noUsers}</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user: any) => {
                  const isBanned = !!user.banned;
                  return (
                    <TableRow key={user.id} hover>
                      <TableCell>{user.name || '-'}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip label={user.role || 'user'} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={isBanned ? t.admin?.users.banned : t.admin?.users.active}
                          size="small"
                          color={isBanned ? 'error' : 'success'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {user.twoFactorEnabled && <CheckCircleIcon fontSize="small" color="success" />}
                      </TableCell>
                      <TableCell align="center">
                        {user.emailVerified && <CheckCircleIcon fontSize="small" color="info" />}
                      </TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell>{renderActions(user)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[25]}
      />

      {banTarget && (
        <BanUserDialog
          open
          onClose={() => setBanTarget(null)}
          userId={banTarget.id}
          userName={banTarget.name}
        />
      )}

      {sessionsTarget && (
        <UserSessionsDialog
          open
          onClose={() => setSessionsTarget(null)}
          userId={sessionsTarget.id}
          userName={sessionsTarget.name}
        />
      )}
    </Box>
  );
}

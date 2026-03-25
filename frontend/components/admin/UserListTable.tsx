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
  Skeleton,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import { Ban, CheckCircle2, UserSearch, Monitor, LockOpen, Shield } from 'lucide-react';
import { useAdminUsers, useImpersonateUser, useUnbanUser } from '@/hooks/queries/use-admin';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useLocale } from '@/lib/hooks/use-locale';
import { formatDateInTz } from '@/lib/utils/format-date-tz';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { BanUserDialog } from './BanUserDialog';
import { UserSessionsDialog } from './UserSessionsDialog';

interface AdminUserRow {
  id: string;
  name?: string | null;
  email: string;
  role?: string | null;
  banned?: boolean | null;
  twoFactorEnabled?: boolean;
  emailVerified?: boolean;
  createdAt: string | Date;
}

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
  const timezone = useUserTimezone();
  const { locale } = useLocale();
  const { data: session } = authClient.useSession();
  const currentUser = session?.user as SessionUser | undefined;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(25);
  const debouncedSearch = useDebounce(search, 300);

  // Dialog state
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null);
  const [sessionsTarget, setSessionsTarget] = useState<{ id: string; name: string } | null>(null);
  const [impersonateTarget, setImpersonateTarget] = useState<string | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<string | null>(null);

  const params = useMemo(() => ({
    limit: rowsPerPage,
    offset: page * rowsPerPage,
    searchValue: debouncedSearch || undefined,
    searchField: debouncedSearch ? 'email' : undefined,
    searchOperator: debouncedSearch ? 'contains' : undefined,
  }), [rowsPerPage, page, debouncedSearch]);

  const { data, isLoading, error, refetch } = useAdminUsers(params);
  const impersonate = useImpersonateUser();
  const unbanUser = useUnbanUser();

  const users = (data?.users ?? []) as AdminUserRow[];
  const total = data?.total ?? 0;

  const handleImpersonate = useCallback((userId: string) => {
    setImpersonateTarget(userId);
  }, []);

  const confirmImpersonate = useCallback(() => {
    if (impersonateTarget) {
      impersonate.mutate(impersonateTarget);
    }
    setImpersonateTarget(null);
  }, [impersonate, impersonateTarget]);

  const handleUnban = useCallback((userId: string) => {
    setUnbanTarget(userId);
  }, []);

  const confirmUnban = useCallback(() => {
    if (unbanTarget) {
      unbanUser.mutate(unbanTarget);
    }
    setUnbanTarget(null);
  }, [unbanUser, unbanTarget]);

  const formatDate = (date: string | Date) => {
    try { return formatDateInTz(date, timezone, locale); }
    catch { return '-'; }
  };

  const renderActions = (user: AdminUserRow) => {
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
                  onClick={() => handleUnban(user.id)}
                  disabled={unbanUser.isPending}
                >
                  <LockOpen size={18} />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title={t.admin?.users.ban}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setBanTarget({ id: user.id, name: user.name || user.email })}
                >
                  <Ban size={18} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={t.admin?.users.impersonate}>
              <IconButton
                size="small"
                onClick={() => handleImpersonate(user.id)}
                disabled={impersonate.isPending}
              >
                <UserSearch size={18} />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title={t.admin?.users.sessions}>
          <IconButton
            size="small"
            onClick={() => setSessionsTarget({ id: user.id, name: user.name || user.email })}
          >
            <Monitor size={18} />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  const renderMobileCards = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="rounded" height={80} />
          ))}
        </Box>
      );
    }
    if (error) {
      return <QueryErrorAlert error={error} onRetry={() => refetch()} />;
    }
    if (users.length === 0) {
      return (
        <EmptyState
          icon={Shield}
          color="#7650ce"
          title={t.admin?.users.emptyTitle ?? 'No users found'}
          description={t.admin?.users.emptyDescription ?? 'No users match the current filters'}
        />
      );
    }
    return users.map((user) => {
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
                  icon={<CheckCircle2 size={14} />}
                  label={t.admin?.users.columns.twoFactor}
                  size="small"
                  color="success"
                  variant="outlined"
                />
              )}
              {user.emailVerified && (
                <Chip
                  icon={<CheckCircle2 size={14} />}
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
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                        <TableCell key={j}><Skeleton variant="text" /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ p: 0 }}>
                    <QueryErrorAlert error={error} onRetry={() => refetch()} />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} sx={{ p: 0 }}>
                    <EmptyState
                      icon={Shield}
                      color="#7650ce"
                      title={t.admin?.users.emptyTitle ?? 'No users found'}
                      description={t.admin?.users.emptyDescription ?? 'No users match the current filters'}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
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
                        {user.twoFactorEnabled && <CheckCircle2 size={18} color="var(--mui-palette-success-main)" />}
                      </TableCell>
                      <TableCell align="center">
                        {user.emailVerified && <CheckCircle2 size={18} color="var(--mui-palette-info-main)" />}
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

      {/* Impersonate Confirmation Dialog */}
      <Dialog open={!!impersonateTarget} onClose={() => setImpersonateTarget(null)}>
        <DialogTitle>{t.admin?.users.impersonate}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t.admin?.users.impersonateConfirm}
          </DialogContentText>
          <DialogContentText sx={{ mt: 1 }}>
            {t.admin?.users.impersonateWarning}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImpersonateTarget(null)}>
            {t.common.cancel}
          </Button>
          <Button onClick={confirmImpersonate} variant="contained" color="warning">
            {t.admin?.users.impersonate}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unban Confirmation Dialog */}
      <Dialog open={!!unbanTarget} onClose={() => setUnbanTarget(null)}>
        <DialogTitle>{t.admin?.users.unban}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t.admin?.users.unbanConfirm}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnbanTarget(null)}>
            {t.common.cancel}
          </Button>
          <Button onClick={confirmUnban} variant="contained" color="success">
            {t.admin?.users.unban}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

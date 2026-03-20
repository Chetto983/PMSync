import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  Typography,
  CircularProgress,
  Box,
} from '@mui/material';
import { useAdminUserSessions, useRevokeUserSessions } from '@/hooks/queries/use-admin';
import { useTranslations } from '@/lib/hooks/use-translations';

interface UserSessionsDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

interface AdminUserSessionRow {
  id?: string;
  token?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  updatedAt?: string | Date | null;
}

export function UserSessionsDialog({ open, onClose, userId, userName }: UserSessionsDialogProps) {
  const t = useTranslations();
  const { data: sessions, isLoading } = useAdminUserSessions(userId);
  const revokeAll = useRevokeUserSessions();

  const handleRevokeAll = () => {
    revokeAll.mutate(userId, { onSuccess: onClose });
  };

  const sessionList = (Array.isArray(sessions) ? sessions : []) as AdminUserSessionRow[];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t.admin?.users.sessionsDialog.title} &mdash; {userName}
      </DialogTitle>
      <DialogContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : sessionList.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            {t.admin?.users.sessionsDialog.noSessions}
          </Typography>
        ) : (
          <List disablePadding>
            {sessionList.map((session) => (
              <ListItem key={session.id || session.token} divider>
                <ListItemText
                  primary={session.userAgent
                    ? (session.userAgent as string).slice(0, 80)
                    : t.admin?.users.sessionsDialog.device}
                  secondary={
                    <>
                      {t.admin?.users.sessionsDialog.ip}: {session.ipAddress || 'N/A'}
                      {' | '}
                      {t.admin?.users.sessionsDialog.lastActive}:{' '}
                      {session.updatedAt
                        ? new Date(session.updatedAt).toLocaleString()
                        : 'N/A'}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          {t.admin?.users.banDialog.cancel}
        </Button>
        {sessionList.length > 0 && (
          <Button
            onClick={handleRevokeAll}
            variant="contained"
            color="warning"
            disabled={revokeAll.isPending}
            startIcon={revokeAll.isPending ? <CircularProgress size={16} /> : null}
          >
            {t.admin?.users.sessionsDialog.revokeAll}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

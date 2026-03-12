import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  Chip,
  IconButton,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Skeleton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { Monitor, Smartphone, Tablet, LogOut, Trash2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const UAParser = require('ua-parser-js') as {
  new(ua: string): {
    getBrowser(): { name?: string };
    getOS(): { name?: string };
    getDevice(): { type?: string };
  };
};

interface SessionItem {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function getDeviceIcon(deviceType?: string) {
  switch (deviceType) {
    case 'mobile': return <Smartphone size={20} />;
    case 'tablet': return <Tablet size={20} />;
    default: return <Monitor size={20} />;
  }
}

export function SecuritySessionsSection() {
  const t = useTranslations();
  const sec = t.settings.securityPanel?.sessions;

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await authClient.listSessions();
      if (result?.data) {
        setSessions(result.data as SessionItem[]);
      }
      // Try to determine current session
      const sessionResult = await authClient.getSession();
      if (sessionResult?.data?.session) {
        setCurrentToken((sessionResult.data.session as { token?: string }).token || null);
      }
    } catch {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleRevoke = useCallback(async (token: string) => {
    try {
      setRevoking(token);
      setError('');
      await authClient.revokeSession({ token });
      loadSessions();
    } catch {
      setError('Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  }, [loadSessions]);

  const handleRevokeAll = useCallback(async () => {
    try {
      setRevokingAll(true);
      setError('');
      await authClient.revokeOtherSessions();
      loadSessions();
    } catch {
      setError('Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
  }, [loadSessions]);

  const parseSession = (session: SessionItem) => {
    const ua = session.userAgent || '';
    const parser = new UAParser(ua);
    const browser = parser.getBrowser().name || 'Unknown browser';
    const os = parser.getOS().name || 'Unknown OS';
    const deviceType = parser.getDevice().type;
    const isCurrent = session.token === currentToken;
    return { browser, os, deviceType, isCurrent };
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={60} sx={{ mb: 1, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={60} sx={{ mb: 1, borderRadius: 1 }} />
      </Box>
    );
  }

  const otherSessions = sessions.filter((s) => s.token !== currentToken);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            {sec?.title || 'Active Sessions'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {sec?.description || 'Manage your active sessions across devices'}
          </Typography>
        </Box>
        {otherSessions.length > 0 && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={revokingAll ? <CircularProgress size={14} /> : <LogOut size={14} />}
            onClick={handleRevokeAll}
            disabled={revokingAll}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            {sec?.revokeAll || 'Revoke all other sessions'}
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <List disablePadding>
        {sessions.map((session) => {
          const { browser, os, deviceType, isCurrent } = parseSession(session);
          return (
            <Card key={session.id} variant="outlined" sx={{ mb: 1 }}>
              <ListItem>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {getDeviceIcon(deviceType)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {browser} on {os}
                      </Typography>
                      {isCurrent && (
                        <Chip
                          label={sec?.current || 'Current session'}
                          color="primary"
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {session.ipAddress && `${session.ipAddress} · `}
                      {session.updatedAt && `${sec?.lastActive || 'Last active'}: ${formatRelativeTime(session.updatedAt)}`}
                    </Typography>
                  }
                />
                {!isCurrent && (
                  <ListItemSecondaryAction>
                    <Tooltip title={sec?.revoke || 'Revoke'}>
                      <IconButton
                        size="small"
                        onClick={() => handleRevoke(session.token)}
                        disabled={revoking === session.token}
                      >
                        {revoking === session.token
                          ? <CircularProgress size={16} />
                          : <Trash2 size={16} />
                        }
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                )}
              </ListItem>
            </Card>
          );
        })}
      </List>

      {otherSessions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          {sec?.noOtherSessions || 'No other active sessions'}
        </Typography>
      )}
    </Box>
  );
}

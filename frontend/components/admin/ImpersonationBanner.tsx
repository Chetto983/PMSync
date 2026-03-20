import React from 'react';
import { Alert, Button, Box } from '@mui/material';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { useStopImpersonating } from '@/hooks/queries/use-admin';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Persistent banner shown at the top of all pages when an admin
 * is impersonating another user. Uses session.impersonatedBy field
 * set by better-auth admin plugin.
 */
export function ImpersonationBanner() {
  const t = useTranslations();
  const { data: session } = authClient.useSession();
  const stopImpersonating = useStopImpersonating();

  // better-auth sets impersonatedBy on the session when impersonating
  const sessionData = session as ({
    session?: { impersonatedBy?: string | null } | null;
    user?: Pick<SessionUser, 'name' | 'email'> | null;
  } | null | undefined);
  const isImpersonating = !!sessionData?.session?.impersonatedBy;
  const userName = sessionData?.user?.name || sessionData?.user?.email || '';

  if (!isImpersonating) return null;

  const bannerText = (t.admin?.impersonation.banner || 'You are impersonating {name}')
    .replace('{name}', userName);

  return (
    <Box sx={{ position: 'relative', zIndex: 1300 }}>
      <Alert
        severity="warning"
        variant="filled"
        sx={{ borderRadius: 0 }}
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => stopImpersonating.mutate()}
            disabled={stopImpersonating.isPending}
          >
            {t.admin?.impersonation.stop}
          </Button>
        }
      >
        {bannerText}
      </Alert>
    </Box>
  );
}

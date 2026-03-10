import React from 'react';
import { Alert, AlertTitle, Button, Box, Stack } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  usePendingInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
} from '@/hooks/queries';

/**
 * Banner shown above main content when user has pending org invitations.
 * Visible until the user accepts or declines each invitation.
 */
export function PendingInvitationBanner() {
  const t = useTranslations();
  const { data: invitations } = usePendingInvitations();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();

  if (!invitations || invitations.length === 0) return null;

  return (
    <Stack spacing={1} sx={{ px: { xs: 1, md: 2 }, pt: 1 }}>
      {(invitations as any[]).map((inv: any) => (
        <Alert
          key={inv.id}
          severity="info"
          action={
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => acceptInvitation.mutate(inv.id)}
                disabled={
                  acceptInvitation.isPending || declineInvitation.isPending
                }
              >
                {t.organizations.invitationBanner.accept}
              </Button>
              <Button
                size="small"
                color="inherit"
                onClick={() => declineInvitation.mutate(inv.id)}
                disabled={
                  acceptInvitation.isPending || declineInvitation.isPending
                }
              >
                {t.organizations.invitationBanner.decline}
              </Button>
            </Box>
          }
        >
          <AlertTitle>
            {t.organizations.invitationBanner.title.replace(
              '{orgName}',
              inv.organization?.name || inv.organizationName || '',
            )}
          </AlertTitle>
        </Alert>
      ))}
    </Stack>
  );
}

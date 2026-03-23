import { useCallback } from 'react';
import { useRouter } from 'next/router';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useAcceptInvitation } from '@/hooks/queries';
import { useTranslations } from '@/lib/hooks/use-translations';

function getErrorMessage(
  error: Error | null,
  t: {
    error: string;
    expired: string;
    notFound: string;
    alreadyMember: string;
  },
): string {
  const msg = error?.message ?? '';
  if (msg.includes('EXPIRED')) return t.expired;
  if (msg.includes('NOT_FOUND')) return t.notFound;
  if (msg.includes('ALREADY_A_MEMBER')) return t.alreadyMember;
  return t.error;
}

export default function AcceptInvitationPage() {
  const router = useRouter();
  const { id } = router.query;
  const t = useTranslations().organizations.invitationAccept;
  const acceptInvitation = useAcceptInvitation();

  const handleAccept = useCallback(() => {
    if (typeof id === 'string') {
      acceptInvitation.mutate(id);
    }
  }, [id, acceptInvitation]);

  if (!id) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <Box sx={{ maxWidth: 480, width: '100%', p: 3 }}>
          <Alert severity="warning">{t.missingId}</Alert>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
      }}
    >
      <Box sx={{ maxWidth: 480, width: '100%', p: 3 }}>
        <Typography variant="h5" sx={{ mb: 3 }}>
          {t.title}
        </Typography>

        {acceptInvitation.isIdle && (
          <>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {t.confirmMessage ?? 'You have been invited to join an organization. Click the button below to accept.'}
            </Typography>
            <Button
              variant="contained"
              onClick={handleAccept}
            >
              {t.acceptButton ?? 'Accept Invitation'}
            </Button>
          </>
        )}

        {acceptInvitation.isPending && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={24} />
            <Typography>{t.accepting}</Typography>
          </Box>
        )}

        {acceptInvitation.isSuccess && (
          <>
            <Alert severity="success" sx={{ mb: 2 }}>
              {t.success}
            </Alert>
            <Button
              variant="contained"
              onClick={() => router.push('/dashboard')}
            >
              {t.goToDashboard}
            </Button>
          </>
        )}

        {acceptInvitation.isError && (
          <>
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(acceptInvitation.error, t)}
            </Alert>
            <Button
              variant="outlined"
              onClick={() => router.push('/dashboard')}
            >
              {t.goToDashboard}
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

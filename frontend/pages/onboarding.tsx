import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Box, CircularProgress } from '@mui/material';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useLegalStatus } from '@/hooks/queries/use-data-rights';
import { minViewportHeightSx } from '@/lib/ui/viewport';

/**
 * Onboarding page.
 *
 * Session check:
 *  - No user -> redirect to login
 *  - Already onboarded -> set cookie, redirect to dashboard
 *  - Needs onboarding -> render wizard
 */
export default function OnboardingPage() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const user = session?.user as SessionUser | undefined;
  const { data: legalStatus, isLoading: legalLoading } = useLegalStatus(!!user);
  const requiresLegalAcceptance = !!user?.onboardingComplete && legalStatus?.allAccepted === false;

  useEffect(() => {
    if (isPending || legalLoading) return;

    if (!user) {
      router.replace('/auth/login');
      return;
    }

    // Already completed and legally current -- ensure cookie is set and go to dashboard
    if (user.onboardingComplete && legalStatus?.allAccepted) {
      document.cookie =
        'pmsync:onboarding-complete=1; path=/; max-age=31536000; SameSite=Lax';
      router.replace('/dashboard');
    }
  }, [user, isPending, legalLoading, legalStatus?.allAccepted, router]);

  if (isPending || legalLoading || !user) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          ...minViewportHeightSx,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return <OnboardingWizard user={user} legalOnly={requiresLegalAcceptance} />;
}

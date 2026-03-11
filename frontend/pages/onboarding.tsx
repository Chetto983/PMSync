import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Box, CircularProgress } from '@mui/material';
import { authClient, type SessionUser } from '@/lib/auth-client';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
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

  useEffect(() => {
    if (isPending) return;

    if (!session?.user) {
      router.replace('/auth/login');
      return;
    }

    // Already completed -- ensure cookie is set and go to dashboard
    if (session.user.onboardingComplete) {
      document.cookie =
        'pmsync:onboarding-complete=1; path=/; max-age=31536000; SameSite=Lax';
      router.replace('/dashboard');
    }
  }, [session, isPending, router]);

  if (isPending || !session?.user) {
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

  return <OnboardingWizard user={session.user as SessionUser} />;
}

import type { SessionUser } from '@/lib/auth-client';

/**
 * Props shared by all onboarding wizard step components.
 * Defined here so Plan 04 step components work even if Plan 03
 * (OnboardingWizard container) hasn't been merged yet.
 */
export interface StepProps {
  user: SessionUser;
  onComplete: (data?: unknown) => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}

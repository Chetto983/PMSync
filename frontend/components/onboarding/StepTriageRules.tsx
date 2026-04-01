import React from 'react';
import { Box } from '@mui/material';
import { TriageSetupForm } from '@/components/email/labels/TriageSetupForm';
import type { StepProps } from './types';

export function StepTriageRules({ onComplete }: StepProps) {
  return (
    <Box sx={{ maxWidth: 560, mx: 'auto' }}>
      <TriageSetupForm
        onApplied={() => onComplete({ triageConfigured: true })}
        onSkip={() => onComplete({ triageConfigured: false })}
        compact
      />
    </Box>
  );
}

export default StepTriageRules;

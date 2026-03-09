import React, { useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Avatar,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Upload, Check } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

export function StepAvatar({ user, onComplete, isLast }: StepProps) {
  const t = useTranslations();
  const sc = t.onboarding.stepContent?.avatar;
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(user.image ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check (2 MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2 MB');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Convert to base64 data URL for inline storage via better-auth
      const dataUrl = await readFileAsDataURL(file);
      setPreview(dataUrl);
      await authClient.updateUser({ image: dataUrl });
      onComplete({ avatarUrl: dataUrl });
    } catch (err) {
      setError((err as Error).message || t.common.genericError);
    } finally {
      setLoading(false);
    }
  };

  const handleUseOAuth = async () => {
    if (!user.image) return;
    onComplete({ avatarUrl: user.image });
  };

  const handleSkip = () => {
    onComplete({ avatarUrl: null });
  };

  return (
    <Box sx={{ textAlign: 'center', maxWidth: 420, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        {sc?.title ?? 'Add Your Photo'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {sc?.description ?? 'Add a profile photo so your team can recognize you'}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Avatar
        src={preview ?? undefined}
        alt={user.name}
        sx={{ width: 120, height: 120, mx: 'auto', mb: 3, fontSize: 48 }}
      >
        {user.name?.charAt(0)?.toUpperCase()}
      </Avatar>

      <Stack spacing={1.5}>
        {user.image && (
          <Button
            variant="contained"
            startIcon={<Check size={18} />}
            onClick={handleUseOAuth}
            disabled={loading}
          >
            {(sc?.useOAuth ?? 'Use {provider} photo').replace('{provider}', 'account')}
          </Button>
        )}

        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={18} /> : <Upload size={18} />}
          onClick={() => fileRef.current?.click()}
          disabled={loading}
        >
          {sc?.upload ?? 'Upload photo'}
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={handleFileChange}
        />

        <Button variant="text" onClick={handleSkip} disabled={loading}>
          {isLast ? t.onboarding.finish : (sc?.skip ?? t.onboarding.skip)}
        </Button>
      </Stack>
    </Box>
  );
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

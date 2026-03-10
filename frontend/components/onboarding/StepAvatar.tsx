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
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { StepProps } from './types';

const MAX_AVATAR_PX = 256;

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

    if (file.size > 5 * 1024 * 1024) {
      setError('File must be under 5 MB');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const dataUrl = await resizeImageToDataURL(file, MAX_AVATAR_PX);
      setPreview(dataUrl);
      // Upload to R2 via backend — stores URL (not base64) in user.image
      const res = await apiClient.put('/api/v1/users/me/avatar', { avatarUrl: dataUrl });
      onComplete({ avatarUrl: res.data.avatarUrl });
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
        sx={{
          width: 120,
          height: 120,
          mx: 'auto',
          mb: 3,
          fontSize: 48,
          '& img': { objectFit: 'cover', objectPosition: 'center' },
        }}
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

/** Crop to center square, then resize to maxPx × maxPx */
function resizeImageToDataURL(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      // Crop: center-square from the shorter dimension
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;

      // Scale down to maxPx (or keep original if smaller)
      const size = Math.min(maxPx, side);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

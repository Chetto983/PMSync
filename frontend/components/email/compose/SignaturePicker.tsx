'use client';

import React from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { Check, Star, Ban } from 'lucide-react';
import { useSignatures } from '@/hooks/queries/use-signatures';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface SignaturePickerProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onSelect: (signatureId: string | null, content: string) => void;
  currentSignatureId?: string | null;
  providerId?: string;
}

export function SignaturePicker({
  anchorEl,
  open,
  onClose,
  onSelect,
  currentSignatureId,
  providerId,
}: SignaturePickerProps) {
  const t = useTranslations();
  const { data: signatures, isLoading } = useSignatures(providerId);

  const handleSelect = (signatureId: string | null, content: string) => {
    onSelect(signatureId, content);
    onClose();
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { sx: { minWidth: 240, maxWidth: 320 } },
      }}
    >
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, px: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          <MenuItem
            selected={currentSignatureId === null || currentSignatureId === undefined}
            onClick={() => handleSelect(null, '')}
          >
            <ListItemIcon>
              {currentSignatureId == null ? <Check size={18} /> : <Ban size={18} />}
            </ListItemIcon>
            <ListItemText>{t.email.composer.noSignature}</ListItemText>
          </MenuItem>

          {signatures && signatures.length > 0 && <Divider />}

          {signatures && signatures.length === 0 && (
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {t.settings.signaturesPanel?.noSignatures ?? 'No signatures yet.'}
              </Typography>
            </Box>
          )}

          {signatures?.map((sig) => (
            <MenuItem
              key={sig.id}
              selected={currentSignatureId === sig.id}
              onClick={() => handleSelect(sig.id, sig.content)}
            >
              <ListItemIcon>
                {currentSignatureId === sig.id ? (
                  <Check size={18} />
                ) : (
                  <Box sx={{ width: 20 }} />
                )}
              </ListItemIcon>
              <ListItemText>{sig.name}</ListItemText>
              {sig.isDefault && (
                <Chip
                  icon={<Star size={14} />}
                  label={t.settings.signaturesPanel?.defaultBadge ?? 'Default'}
                  size="small"
                  variant="outlined"
                  sx={{ ml: 1, height: 22 }}
                />
              )}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

export default SignaturePicker;

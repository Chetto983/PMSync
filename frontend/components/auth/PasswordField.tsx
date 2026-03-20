import React, { useState } from 'react';
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * TextField with show/hide password toggle.
 */
export function PasswordField(props: TextFieldProps) {
  const [show, setShow] = useState(false);
  const t = useTranslations();

  return (
    <TextField
      {...props}
      type={show ? 'text' : 'password'}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setShow((s) => !s)}
                edge="end"
                size="small"
                aria-label={show ? t.common.hidePassword : t.common.showPassword}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

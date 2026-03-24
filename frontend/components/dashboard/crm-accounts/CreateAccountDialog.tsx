import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Grid,
  Typography,
  Divider,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateAccount } from '@/hooks/queries/use-crm-accounts';
import type { CreateAccountDto } from '@/lib/api/crm-accounts';

const INDUSTRIES = [
  'technology', 'healthcare', 'finance', 'manufacturing', 'retail',
  'education', 'consulting', 'realEstate', 'media', 'energy', 'other',
] as const;

const SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;

interface CreateAccountDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateAccountDialog({ open, onClose }: CreateAccountDialogProps) {
  const t = useTranslations();
  const ta = t.crmAccounts;
  const createAccount = useCreateAccount();

  const [form, setForm] = useState<CreateAccountDto>({
    name: '',
    website: '',
    industry: '',
    size: '',
    phone: '',
    description: '',
    revenue: undefined,
    currency: 'EUR',
    address: { street: '', city: '', state: '', zip: '', country: '' },
  });

  const handleChange = (field: keyof CreateAccountDto, value: string | number | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      address: { ...prev.address, [field]: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    // Clean empty strings to undefined
    const dto: CreateAccountDto = {
      name: form.name.trim(),
      ...(form.website && { website: form.website.trim() }),
      ...(form.industry && { industry: form.industry }),
      ...(form.size && { size: form.size }),
      ...(form.phone && { phone: form.phone.trim() }),
      ...(form.description && { description: form.description.trim() }),
      ...(form.revenue && { revenue: form.revenue, currency: form.currency || 'EUR' }),
    };

    // Only include address if any field is filled
    const addr = form.address;
    if (addr && (addr.street || addr.city || addr.state || addr.zip || addr.country)) {
      dto.address = addr;
    }

    await createAccount.mutateAsync(dto);
    onClose();
    setForm({
      name: '', website: '', industry: '', size: '', phone: '',
      description: '', revenue: undefined, currency: 'EUR',
      address: { street: '', city: '', state: '', zip: '', country: '' },
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{ta?.newAccount}</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField
                label={ta?.form?.name}
                placeholder={ta?.form?.namePlaceholder}
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                fullWidth
                required
                autoFocus
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label={ta?.form?.website}
                placeholder={ta?.form?.websitePlaceholder}
                value={form.website}
                onChange={(e) => handleChange('website', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.industry}
                value={form.industry}
                onChange={(e) => handleChange('industry', e.target.value)}
                fullWidth
                select
              >
                <MenuItem value="">—</MenuItem>
                {INDUSTRIES.map((ind) => (
                  <MenuItem key={ind} value={ind}>
                    {ta?.industries?.[ind] ?? ind}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.size}
                value={form.size}
                onChange={(e) => handleChange('size', e.target.value)}
                fullWidth
                select
              >
                <MenuItem value="">—</MenuItem>
                {SIZES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {ta?.sizes?.[s] ?? s}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.revenue}
                type="number"
                value={form.revenue ?? ''}
                onChange={(e) => handleChange('revenue', e.target.value ? Number(e.target.value) : undefined)}
                fullWidth
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.phone}
                placeholder={ta?.form?.phonePlaceholder}
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid size={12}>
              <TextField
                label={ta?.form?.description}
                placeholder={ta?.form?.descriptionPlaceholder}
                value={form.description}
                onChange={(e) => handleChange('description', e.target.value)}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>

            {/* Address section */}
            <Grid size={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {ta?.form?.address}
              </Typography>
            </Grid>
            <Grid size={12}>
              <TextField
                label={ta?.form?.street}
                value={form.address?.street ?? ''}
                onChange={(e) => handleAddressChange('street', e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.city}
                value={form.address?.city ?? ''}
                onChange={(e) => handleAddressChange('city', e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.state}
                value={form.address?.state ?? ''}
                onChange={(e) => handleAddressChange('state', e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.zip}
                value={form.address?.zip ?? ''}
                onChange={(e) => handleAddressChange('zip', e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label={ta?.form?.country}
                value={form.address?.country ?? ''}
                onChange={(e) => handleAddressChange('country', e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{ta?.cancel}</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!form.name.trim() || createAccount.isPending}
          >
            {ta?.create}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

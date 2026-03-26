import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Box,
  Typography,
  Breadcrumbs,
  Link as MuiLink,
  Tab,
  Tabs,
  Paper,
  Skeleton,
  Alert,
  Button,
  IconButton,
  TextField,
  Tooltip,
  Grid,
  MenuItem,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  ArrowLeft,
  Globe,
  Phone,
  MapPin,
  Building2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAccount, useUpdateAccount } from '@/hooks/queries';
import { useDeals } from '@/hooks/queries/use-crm-deals';
import type { CrmAccount, UpdateAccountDto } from '@/lib/api/crm-accounts';
import { useGlobalToast } from '@/lib/context/toast-context';
import { AccountHierarchyTree } from './AccountHierarchyTree';
import { AccountContactsTab } from './AccountContactsTab';
import { AddressEditSection } from './AddressEditSection';
import { AccountActivityTab } from './AccountActivityTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  if (value !== index) return null;
  return <Box sx={{ py: 2 }}>{children}</Box>;
}

// ---- Inline Edit Field ----

function InlineEditField({
  value,
  fieldKey,
  label,
  placeholder,
  multiline,
  onSave,
}: {
  value: string | null | undefined;
  fieldKey: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  onSave: (key: string, val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const handleSave = () => {
    onSave(fieldKey, draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
        <TextField
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          size="small"
          fullWidth
          multiline={multiline}
          rows={multiline ? 3 : undefined}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !multiline) handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
        />
        <IconButton size="small" onClick={handleSave} color="primary">
          <Check size={16} />
        </IconButton>
        <IconButton size="small" onClick={handleCancel}>
          <X size={16} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Tooltip title={label}>
      <Box
        onClick={() => setEditing(true)}
        sx={{
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
          px: 1,
          py: 0.5,
          minHeight: 32,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography
          variant="body2"
          color={value ? 'text.primary' : 'text.disabled'}
          sx={{ flex: 1 }}
        >
          {value || placeholder}
        </Typography>
        <Pencil size={14} style={{ opacity: 0.4 }} />
      </Box>
    </Tooltip>
  );
}

// ---- Constants ----

const INDUSTRIES = [
  'technology', 'healthcare', 'finance', 'manufacturing', 'retail',
  'education', 'consulting', 'realEstate', 'media', 'energy', 'other',
] as const;

const SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'] as const;

// ---- Info Section ----

function AccountInfoCard({
  account,
  onSave,
}: {
  account: CrmAccount;
  onSave: (dto: UpdateAccountDto) => void;
}) {
  const t = useTranslations();
  const ta = t.crmAccounts;

  const handleFieldSave = useCallback(
    (key: string, value: string) => {
      const dto: UpdateAccountDto = { [key]: value || undefined };
      onSave(dto);
    },
    [onSave],
  );

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
            {ta?.form?.description}
          </Typography>
          <InlineEditField
            value={account.description}
            fieldKey="description"
            label={ta?.detail?.info?.editField ?? 'Click to edit'}
            placeholder={ta?.detail?.info?.noDescription ?? 'No description'}
            multiline
            onSave={handleFieldSave}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Globe size={16} />
              <InlineEditField
                value={account.website}
                fieldKey="website"
                label={ta?.form?.website ?? 'Website'}
                placeholder={ta?.detail?.info?.noWebsite ?? 'No website'}
                onSave={handleFieldSave}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Phone size={16} />
              <InlineEditField
                value={account.phone}
                fieldKey="phone"
                label={ta?.form?.phone ?? 'Phone'}
                placeholder={ta?.detail?.info?.noPhone ?? 'No phone'}
                onSave={handleFieldSave}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin size={16} />
              <AddressEditSection
                address={account.address}
                onSave={(addr) => onSave({ address: addr })}
              />
            </Box>
          </Box>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 0.5 }} />
        </Grid>

        {/* Industry / Size / Revenue — editable selects */}
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={ta?.form?.industry ?? 'Industry'}
            value={account.industry ?? ''}
            onChange={(e) => onSave({ industry: e.target.value || undefined })}
            fullWidth
            size="small"
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
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={ta?.form?.size ?? 'Size'}
            value={account.size ?? ''}
            onChange={(e) => onSave({ size: e.target.value || undefined })}
            fullWidth
            size="small"
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
        <Grid size={{ xs: 12, sm: 4 }}>
          <TextField
            label={ta?.form?.revenue ?? 'Revenue'}
            type="number"
            value={account.revenue ?? ''}
            onChange={(e) =>
              onSave({
                revenue: e.target.value ? Number(e.target.value) : undefined,
                currency: account.currency || 'EUR',
              })
            }
            fullWidth
            size="small"
            slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
          />
        </Grid>
      </Grid>
    </Paper>
  );
}

// ---- Account Deals Tab ----

function AccountDealsTab({ accountId }: { accountId: string }) {
  const t = useTranslations();
  const td = t.crmDeals;
  const ta = t.crmAccounts;
  const router = useRouter();
  const { data, isLoading } = useDeals({ accountId, limit: 50 });
  const rows = data?.data ?? [];

  if (isLoading) {
    return (
      <Box sx={{ py: 2 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={40} sx={{ mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          {ta?.detail?.deals?.noDeals ?? 'No deals for this account'}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          sx={{ mt: 1 }}
          onClick={() => router.push('/dashboard/crm/deals')}
        >
          {ta?.detail?.deals?.goToDeals ?? 'Go to Deals'}
        </Button>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{td?.columns?.name ?? 'Name'}</TableCell>
            <TableCell>{td?.columns?.stage ?? 'Stage'}</TableCell>
            <TableCell align="right">{td?.columns?.amount ?? 'Amount'}</TableCell>
            <TableCell>{td?.columns?.priority ?? 'Priority'}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((deal) => (
            <TableRow
              key={deal.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => router.push(`/dashboard/crm/deals/${deal.id}`)}
            >
              <TableCell>
                <Typography variant="body2" fontWeight={500} color="primary">
                  {deal.name}
                </Typography>
              </TableCell>
              <TableCell>
                {deal.stage ? (
                  <Chip
                    label={deal.stage.name}
                    size="small"
                    variant="outlined"
                    sx={{
                      borderColor: deal.stage.color ?? undefined,
                      color: deal.stage.color ?? undefined,
                    }}
                  />
                ) : '—'}
              </TableCell>
              <TableCell align="right">
                <Typography variant="body2">
                  {deal.amount
                    ? new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: deal.currency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      }).format(parseFloat(deal.amount))
                    : '—'}
                </Typography>
              </TableCell>
              <TableCell>
                {deal.priority ? (
                  <Chip
                    label={td?.priorities?.[deal.priority as keyof NonNullable<typeof td.priorities>] ?? deal.priority}
                    size="small"
                    variant="outlined"
                  />
                ) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ---- Main Component ----

export function AccountDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const t = useTranslations();
  const ta = t.crmAccounts;
  const toast = useGlobalToast();
  const [tab, setTab] = useState(0);

  const { data: account, isLoading, error } = useAccount(id);
  const updateAccount = useUpdateAccount();

  const handleSave = useCallback(
    async (dto: UpdateAccountDto) => {
      if (!id) return;
      try {
        await updateAccount.mutateAsync({ id, dto });
        toast.success(ta?.updated ?? 'Updated');
      } catch {
        toast.error(t.common.genericError);
      }
    },
    [id, updateAccount, toast, ta, t],
  );

  if (!router.isReady || isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 1 }} />
        <Skeleton width="60%" height={36} sx={{ mb: 2 }} />
        <Skeleton width="100%" height={48} sx={{ mb: 2 }} />
        <Skeleton width="100%" height={200} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as { status?: number })?.status === 404
            ? 'Account not found'
            : t.common.genericError}
        </Alert>
        <Button
          startIcon={<ArrowLeft size={16} />}
          onClick={() => router.push('/dashboard/crm/accounts')}
        >
          {ta?.breadcrumb?.accounts ?? 'Accounts'}
        </Button>
      </Box>
    );
  }

  if (!account) return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 1 }}>
        <MuiLink
          component={NextLink}
          href="/dashboard"
          underline="hover"
          color="text.secondary"
          variant="body2"
        >
          {ta?.breadcrumb?.dashboard ?? 'Dashboard'}
        </MuiLink>
        <Typography variant="body2" color="text.secondary">
          {ta?.breadcrumb?.crm ?? 'CRM'}
        </Typography>
        <MuiLink
          component={NextLink}
          href="/dashboard/crm/accounts"
          underline="hover"
          color="text.secondary"
          variant="body2"
        >
          {ta?.breadcrumb?.accounts ?? 'Accounts'}
        </MuiLink>
        <Typography variant="body2" color="text.primary">
          {account.name}
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <IconButton
          onClick={() => router.push('/dashboard/crm/accounts')}
          size="small"
        >
          <ArrowLeft size={20} />
        </IconButton>
        <Building2 size={28} />
        <Box sx={{ flex: 1 }}>
          <InlineEditField
            value={account.name}
            fieldKey="name"
            label={ta?.form?.name ?? 'Account Name'}
            placeholder="Account name"
            onSave={(_, val) => handleSave({ name: val })}
          />
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}
      >
        <Tab label={ta?.detail?.tabs?.info ?? 'Info'} />
        <Tab label={ta?.detail?.tabs?.contacts ?? 'Contacts'} />
        <Tab label={ta?.detail?.tabs?.deals ?? 'Deals'} />
        <Tab label={ta?.detail?.tabs?.activity ?? 'Activity'} />
      </Tabs>

      {/* Tab Panels */}
      <TabPanel value={tab} index={0}>
        <AccountInfoCard account={account} onSave={handleSave} />
        <AccountHierarchyTree account={account} />
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <AccountContactsTab accountId={id} />
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <AccountDealsTab accountId={id} />
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <AccountActivityTab accountId={id} />
      </TabPanel>
    </Box>
  );
}

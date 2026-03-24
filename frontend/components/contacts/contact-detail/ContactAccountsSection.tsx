import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Autocomplete,
  TextField,
  CircularProgress,
  Skeleton,
  Alert,
} from '@mui/material';
import { Building2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGlobalToast } from '@/lib/context/toast-context';
import {
  useContactAccounts,
  useAccounts,
  useLinkContact,
  useUnlinkContact,
} from '@/hooks/queries/use-crm-accounts';
import type { CrmAccount, ContactAccountLink } from '@/lib/api/crm-accounts';

interface ContactAccountsSectionProps {
  contactId: string;
}

export function ContactAccountsSection({ contactId }: ContactAccountsSectionProps) {
  const t = useTranslations();
  const ta = t.contacts?.details?.accounts;
  const tr = t.crmAccounts?.detail?.contactRoles;
  const toast = useGlobalToast();
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<CrmAccount | null>(null);

  const { data: links, isLoading, isError } = useContactAccounts(contactId);
  const { data: searchResults, isLoading: isSearching } = useAccounts(
    adding ? { search: search || undefined, limit: 10 } : undefined,
  );
  const linkContact = useLinkContact();
  const unlinkContact = useUnlinkContact();

  const handleLink = async (account: CrmAccount) => {
    try {
      await linkContact.mutateAsync({
        accountId: account.id,
        dto: { contactId },
      });
      toast.success(ta?.linked ?? 'Account linked');
      setAdding(false);
      setSearch('');
      setSelectedAccount(null);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(ta?.alreadyLinked ?? 'Already linked');
      } else {
        toast.error(t.common.genericError);
      }
    }
  };

  const handleUnlink = async (link: ContactAccountLink) => {
    if (!window.confirm(ta?.unlinkConfirm ?? 'Remove this account link?')) return;
    try {
      await unlinkContact.mutateAsync({
        accountId: link.accountId,
        contactId,
      });
      toast.success(ta?.unlinked ?? 'Account removed');
    } catch {
      toast.error(t.common.genericError);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ mb: 3 }}>
        <Skeleton width="40%" height={24} sx={{ mb: 1 }} />
        <Skeleton width="100%" height={40} />
      </Box>
    );
  }

  if (isError) {
    return <Alert severity="error" sx={{ mb: 3 }}>{t.common.genericError}</Alert>;
  }

  const accounts = links ?? [];
  const searchOptions = searchResults?.data ?? [];

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {ta?.title ?? 'Linked Accounts'}
        </Typography>
        {!adding && (
          <IconButton size="small" onClick={() => setAdding(true)} color="primary">
            <Plus size={18} />
          </IconButton>
        )}
      </Box>

      {/* Linked accounts list */}
      {accounts.length === 0 && !adding && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {ta?.noAccounts ?? 'No accounts linked'}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {accounts.map((link: ContactAccountLink) => (
          <Box
            key={link.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              px: 1,
              borderRadius: 1,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Building2 size={16} />
            <Typography
              variant="body2"
              fontWeight={500}
              sx={{ flex: 1, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={() => router.push(`/dashboard/crm/accounts/${link.accountId}`)}
            >
              {link.account.name}
            </Typography>
            {link.role && (
              <Chip
                label={tr?.[link.role as keyof typeof tr] ?? link.role}
                size="small"
                variant="outlined"
              />
            )}
            <IconButton size="small" onClick={() => router.push(`/dashboard/crm/accounts/${link.accountId}`)}>
              <ExternalLink size={14} />
            </IconButton>
            <IconButton size="small" onClick={() => handleUnlink(link)}>
              <Trash2 size={14} />
            </IconButton>
          </Box>
        ))}
      </Box>

      {/* Add account autocomplete */}
      {adding && (
        <Box sx={{ mt: 1 }}>
          <Autocomplete
            options={searchOptions}
            getOptionLabel={(option) => option.name}
            loading={isSearching}
            value={selectedAccount}
            onChange={(_e, value) => {
              if (value) {
                handleLink(value);
              }
              setSelectedAccount(null);
            }}
            onInputChange={(_e, value) => setSearch(value)}
            inputValue={search}
            filterOptions={(x) => x}
            noOptionsText={t.crmAccounts?.noAccountsFound ?? 'No accounts found'}
            size="small"
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={ta?.searchAccounts ?? 'Search accounts...'}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setSearch('');
                  }
                }}
                slotProps={{
                  input: {
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {isSearching ? <CircularProgress size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  },
                }}
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Building2 size={16} />
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {option.name}
                    </Typography>
                    {option.industry && (
                      <Typography variant="caption" color="text.secondary">
                        {option.industry}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
          />
        </Box>
      )}
    </Box>
  );
}

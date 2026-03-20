import React, { useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  User,
  Mail,
  Sparkles,
  Shield,
  CreditCard,
  FileSignature,
  ShieldCheck,
  DatabaseZap,
  Send,
} from 'lucide-react';
import { WritingStyleSettings } from '@/components/email/compose/WritingStyleSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import {
  GeneralSettings,
  AiSettings,
  AccountsSettings,
  AccountSettings,
} from '@/components/settings';
import { SignatureSettings } from '@/components/settings/SignatureSettings';
import { ConsentSettings } from '@/components/dashboard/consent/ConsentSettings';
import { DataExportPanel } from '@/components/dashboard/data-rights/DataExportPanel';
import { AccountDeletionPanel } from '@/components/dashboard/data-rights/AccountDeletionPanel';
import { BillingPanel } from '@/components/billing';
import { TelegramSettingsPanel } from '@/components/reminders/TelegramSettingsPanel';
import { providersApi } from '@/lib/api/providers';
import { useSettingsState } from './settings/useSettingsState';
import type { SettingsSection } from './settings/useSettingsState';
import { useSettingsCopy } from './settings/useSettingsCopy';
import { useSettingsHandlers } from './settings/useSettingsHandlers';
import { SettingsSidebar } from './settings/SettingsSidebar';

function getProviderConnectError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const response = (error as {
      response?: { data?: { message?: unknown } };
    }).response;
    if (typeof response?.data?.message === 'string') {
      return response.data.message;
    }
  }

  return 'Failed to connect provider';
}

export function Settings() {
  const s = useSettingsState();
  const { t, settingsCopy, generalCopy, aiCopy, accountsCopy, accountCopy, signaturesCopy } = useSettingsCopy();
  const h = useSettingsHandlers(s, settingsCopy);
  const {
    router,
    refetchProviders,
    setSelectedSection,
    setProviderSuccess,
    setProviderError,
  } = s;
  const telegramTitle = t.ai.reminders?.telegram?.title || 'Telegram';
  const { isReady, pathname, query } = router;

  const sections = useMemo(
    () => [
      { id: 'general', label: settingsCopy.sections.general, icon: <SettingsIcon size={18} /> },
      { id: 'security', label: settingsCopy.sections.security || 'Security', icon: <Shield size={18} /> },
      { id: 'ai', label: settingsCopy.sections.ai, icon: <Sparkles size={18} /> },
      { id: 'accounts', label: settingsCopy.sections.accounts, icon: <Mail size={18} /> },
      { id: 'signatures', label: settingsCopy.sections.signatures || 'Signatures', icon: <FileSignature size={18} /> },
      { id: 'consent', label: settingsCopy.sections.consent || 'Privacy & Consent', icon: <ShieldCheck size={18} /> },
      { id: 'dataRights', label: settingsCopy.sections.dataRights || 'Data & Privacy', icon: <DatabaseZap size={18} /> },
      { id: 'account', label: settingsCopy.sections.account, icon: <User size={18} /> },
      { id: 'billing', label: settingsCopy.sections.billing || 'Billing', icon: <CreditCard size={18} /> },
      { id: 'telegram', label: telegramTitle, icon: <Send size={18} /> },
    ],
    [settingsCopy.sections, telegramTitle],
  );

  // Handle URL section param
  useEffect(() => {
    if (!isReady) return;
    const sectionParam = query.section;
    if (typeof sectionParam === 'string' && sections.some((sec) => sec.id === sectionParam)) {
      setSelectedSection(sectionParam as SettingsSection);
    }
  }, [isReady, query.section, sections, setSelectedSection]);

  // Handle OAuth callback
  useEffect(() => {
    if (!isReady) return;
    const { success, error } = query;
    if (success) {
      setSelectedSection('accounts');
      setProviderSuccess('Account connected successfully');
      void refetchProviders();
      void router.replace({ pathname, query: { section: 'accounts' } }, undefined, { shallow: true });
    }
    if (error && typeof error === 'string') {
      setSelectedSection('accounts');
      setProviderError(error);
      void router.replace({ pathname, query: { section: 'accounts' } }, undefined, { shallow: true });
    }
  }, [
    isReady,
    pathname,
    query,
    refetchProviders,
    router,
    setProviderError,
    setProviderSuccess,
    setSelectedSection,
  ]);

  // Handle provider-link OAuth callback (code + state + provider from proxy redirect)
  const codeExchangeHandled = useRef(false);
  useEffect(() => {
    if (!isReady || codeExchangeHandled.current) return;
    const { code, state, provider } = query;
    if (typeof code !== 'string' || typeof provider !== 'string') return;
    codeExchangeHandled.current = true;

    setSelectedSection('accounts');
    void router.replace(
      { pathname, query: { section: 'accounts' } },
      undefined,
      { shallow: true },
    );

    const connectFn = provider === 'google'
      ? providersApi.connectGoogle({ authorizationCode: code, state: typeof state === 'string' ? state : undefined })
      : providersApi.connectMicrosoft({ authorizationCode: code, state: typeof state === 'string' ? state : undefined });

    void connectFn
      .then(() => {
        setProviderSuccess('Account connected successfully');
        void refetchProviders();
      })
      .catch((error) => {
        setProviderError(getProviderConnectError(error));
      });
  }, [
    isReady,
    pathname,
    query,
    refetchProviders,
    router,
    setProviderError,
    setProviderSuccess,
    setSelectedSection,
  ]);

  if (!s.hydrated) {
    return (
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 3 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sidebar */}
      <SettingsSidebar sections={sections} selectedSection={s.selectedSection} onSelect={h.handleSectionSelect} accountName={s.accountName} email={s.user?.email || ''} />

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Mobile nav */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, px: 2, py: 1.5, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', alignItems: 'center', gap: 2 }}>
          <FormControl size="small" fullWidth>
            <Select value={s.selectedSection} onChange={(e) => h.handleSectionSelect(e.target.value as SettingsSection)}>
              {sections.map((sec) => <MenuItem key={sec.id} value={sec.id}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{sec.icon}{sec.label}</Box></MenuItem>)}
            </Select>
          </FormControl>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
          <Box sx={{ maxWidth: 1200 }}>
            {s.selectedSection === 'general' && (
              <GeneralSettings theme={s.theme} setTheme={s.setTheme} language={s.language} setLanguage={s.setLanguage} timezone={s.timezone} setTimezone={s.setTimezone} emailDensity={s.emailDensity} setEmailDensity={s.setEmailDensity} saveLoading={s.saveLoading} onSave={h.handleSaveSettings} success={s.generalSuccess} error={s.generalError} onClearSuccess={() => s.setGeneralSuccess('')} onClearError={() => s.setGeneralError('')} copy={generalCopy} />
            )}
            {s.selectedSection === 'security' && <SecuritySettings />}
            {s.selectedSection === 'ai' && (
              <>
                <AiSettings loading={s.aiProfileLoading} saveLoading={s.aiSaveLoading} dataLoading={s.aiDataLoading} success={s.aiSuccess} error={s.aiError} onClearSuccess={() => s.setAiSuccess('')} onClearError={() => s.setAiError('')} canUseSmartReplies={s.canUseSmartReplies} smartRepliesEnabled={s.smartRepliesEnabled} setSmartRepliesEnabled={s.setSmartRepliesEnabled} canUseSummaries={s.canUseSummaries} summarizationEnabled={s.summarizationEnabled} setSummarizationEnabled={s.setSummarizationEnabled} schedulingEnabled={s.schedulingEnabled} setSchedulingEnabled={s.setSchedulingEnabled} canUseTriage={s.canUseTriage} triageEnabled={s.triageEnabled} setTriageEnabled={s.setTriageEnabled} jobRole={s.jobRole} setJobRole={s.setJobRole} communicationStyle={s.communicationStyle} setCommunicationStyle={s.setCommunicationStyle} responseLength={s.responseLength} setResponseLength={s.setResponseLength} proactivityLevel={s.proactivityLevel} setProactivityLevel={s.setProactivityLevel} autoApproveThreshold={s.autoApproveThreshold} setAutoApproveThreshold={s.setAutoApproveThreshold} onSave={h.handleSaveAiProfile} onClearMemory={h.handleClearAiMemory} onOpenAssistant={() => s.router.push('/dashboard/ai')} copy={aiCopy} />
                <WritingStyleSettings />
              </>
            )}
            {s.selectedSection === 'accounts' && (
              <AccountsSettings providers={s.providers} providersLoading={s.providersLoading} syncLoading={s.syncAllMutation.isPending} success={s.providerSuccess} error={s.providerError} onClearSuccess={() => s.setProviderSuccess('')} onClearError={() => s.setProviderError('')} onRefresh={() => s.refetchProviders()} onSyncAll={h.handleSyncAll} onProviderInitiated={() => { h.handleProviderInitiated(); s.refetchLimits(); }} onProviderConnected={() => { h.handleProviderConnected(); s.refetchLimits(); }} onProviderDeleted={() => { h.handleProviderDeleted(); s.refetchLimits(); }} copy={accountsCopy} limits={s.subscriptionLimits} />
            )}
            {s.selectedSection === 'signatures' && (
              <SignatureSettings
                signatures={s.signaturesData.map(sig => ({ id: sig.id, name: sig.name, content: sig.content, providerId: sig.providerId ?? null, isDefault: sig.isDefault, createdAt: sig.createdAt, updatedAt: sig.updatedAt }))}
                providers={s.providers.map(p => ({ id: p.id, email: p.email, providerType: p.providerType, isDefault: p.isDefault }))}
                onSave={h.handleSaveSignature}
                onDelete={h.handleDeleteSignature}
                onSetDefault={h.handleSetDefaultSignature}
                loading={s.signaturesLoading || s.createSignatureMutation.isPending || s.updateSignatureMutation.isPending || s.deleteSignatureMutation.isPending}
                error={s.signatureError}
                onClearError={() => s.setSignatureError('')}
                copy={signaturesCopy}
              />
            )}
            {s.selectedSection === 'consent' && <ConsentSettings />}
            {s.selectedSection === 'dataRights' && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {settingsCopy.dataRights?.title || 'Data & Privacy'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  {t.settings.dataRights?.export?.description || ''}
                </Typography>
                <DataExportPanel />
                <AccountDeletionPanel />
              </Box>
            )}
            {s.selectedSection === 'account' && (
              <AccountSettings accountName={s.accountName} email={s.user?.email || ''} role={s.user?.role || ''} language={s.language} avatarUrl={s.avatarUrl} avatarUploading={s.avatarUploading} onAvatarUpload={h.handleAvatarUpload} onAvatarSave={h.handleAvatarSave} onAvatarRemove={h.handleAvatarRemove} deleteDialogOpen={s.deleteDialogOpen} deleteConfirmText={s.deleteConfirmText} deleteLoading={s.deleteLoading} deleteError={s.deleteError} onOpenDeleteDialog={() => s.setDeleteDialogOpen(true)} onCloseDeleteDialog={h.handleCloseDeleteDialog} onDeleteConfirmTextChange={s.setDeleteConfirmText} onDeleteAccount={h.handleDeleteAccount} copy={accountCopy} />
            )}
            {s.selectedSection === 'billing' && <BillingPanel />}
            {s.selectedSection === 'telegram' && <TelegramSettingsPanel />}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

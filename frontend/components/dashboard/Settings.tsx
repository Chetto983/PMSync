import React, { useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Skeleton,
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
import dynamic from 'next/dynamic';
import {
  GeneralSettings,
  AiSettings,
  AccountsSettings,
  AccountSettings,
} from '@/components/settings';
import { FileText, Clock } from 'lucide-react';

// Lazy-loaded settings sections — only loaded when their tab is selected
const WritingStyleSettings = dynamic(() => import('@/components/email/compose/WritingStyleSettings').then(m => ({ default: m.WritingStyleSettings })), { ssr: false });
const SecuritySettings = dynamic(() => import('@/components/settings/SecuritySettings').then(m => ({ default: m.SecuritySettings })), { ssr: false });
const SignatureSettings = dynamic(() => import('@/components/settings/SignatureSettings').then(m => ({ default: m.SignatureSettings })), { ssr: false });
const TemplateSettings = dynamic(() => import('@/components/settings/TemplateSettings').then(m => ({ default: m.TemplateSettings })), { ssr: false });
const ScheduledEmailsList = dynamic(() => import('@/components/settings/ScheduledEmailsList').then(m => ({ default: m.ScheduledEmailsList })), { ssr: false });
const ConsentSettings = dynamic(() => import('@/components/dashboard/consent/ConsentSettings').then(m => ({ default: m.ConsentSettings })), { ssr: false });
const DataExportPanel = dynamic(() => import('@/components/dashboard/data-rights/DataExportPanel').then(m => ({ default: m.DataExportPanel })), { ssr: false });
const AccountDeletionPanel = dynamic(() => import('@/components/dashboard/data-rights/AccountDeletionPanel').then(m => ({ default: m.AccountDeletionPanel })), { ssr: false });
const BillingPanel = dynamic(() => import('@/components/billing').then(m => ({ default: m.BillingPanel })), { ssr: false });
const TelegramSettingsPanel = dynamic(() => import('@/components/reminders/TelegramSettingsPanel').then(m => ({ default: m.TelegramSettingsPanel })), { ssr: false });
import { providersApi } from '@/lib/api/providers';
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useSetDefaultTemplate,
  useDuplicateTemplate,
} from '@/hooks/queries/use-templates';
import { useSettingsState } from './settings/useSettingsState';
import type { SettingsSection } from './settings/useSettingsState';
import { useSettingsCopy } from './settings/useSettingsCopy';
import { useSettingsHandlers } from './settings/useSettingsHandlers';
import { SettingsSidebar } from './settings/SettingsSidebar';

function getProviderConnectError(error: unknown, fallback: string): string {
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

  return fallback;
}

export function Settings() {
  const s = useSettingsState();
  const { t, settingsCopy, generalCopy, aiCopy, accountsCopy, accountCopy, signaturesCopy } = useSettingsCopy();

  // Template hooks
  const { data: templatesRaw, isLoading: templatesLoading } = useTemplates();
  const templatesData = templatesRaw?.templates ?? [];
  const createTemplateMutation = useCreateTemplate();
  const updateTemplateMutation = useUpdateTemplate();
  const deleteTemplateMutation = useDeleteTemplate();
  const setDefaultTemplateMutation = useSetDefaultTemplate();
  const duplicateTemplateMutation = useDuplicateTemplate();
  const [templateError, setTemplateError] = React.useState('');
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
      { id: 'templates', label: settingsCopy.sections.templates || 'Templates', icon: <FileText size={18} /> },
      { id: 'scheduled', label: settingsCopy.sections.scheduled || 'Scheduled', icon: <Clock size={18} /> },
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
      setProviderSuccess(t.common.providerConnectSuccess ?? 'Account connected successfully');
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
        setProviderSuccess(t.common.providerConnectSuccess ?? 'Account connected successfully');
        void refetchProviders();
      })
      .catch((error) => {
        setProviderError(getProviderConnectError(error, t.common.providerConnectError ?? 'Failed to connect provider'));
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
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, bgcolor: 'background.default', p: 3, gap: 3 }}>
        {/* Sidebar skeleton */}
        <Box sx={{ width: 200, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: 1.5, pt: 2 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} variant="text" width="80%" height={28} />
          ))}
        </Box>
        {/* Content skeleton */}
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width={200} height={36} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={400} />
        </Box>
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
            {s.selectedSection === 'templates' && (
              <TemplateSettings
                templates={templatesData}
                onSave={(tmpl) => {
                  const op = tmpl.id
                    ? updateTemplateMutation.mutateAsync({ id: tmpl.id, dto: { name: tmpl.name, subject: tmpl.subject, bodyHtml: tmpl.bodyHtml, category: tmpl.category ?? undefined, isDefault: tmpl.isDefault } })
                    : createTemplateMutation.mutateAsync({ name: tmpl.name, subject: tmpl.subject || '', bodyHtml: tmpl.bodyHtml, category: tmpl.category ?? undefined, isDefault: tmpl.isDefault });
                  op.catch((err: unknown) => setTemplateError(err instanceof Error ? err.message : 'Failed to save template'));
                }}
                onDelete={(id) => deleteTemplateMutation.mutateAsync(id).catch((err: unknown) => setTemplateError(err instanceof Error ? err.message : 'Failed to delete'))}
                onSetDefault={(id) => setDefaultTemplateMutation.mutateAsync(id).catch((err: unknown) => setTemplateError(err instanceof Error ? err.message : 'Failed'))}
                onDuplicate={(id) => duplicateTemplateMutation.mutateAsync({ id }).catch((err: unknown) => setTemplateError(err instanceof Error ? err.message : 'Failed'))}
                loading={templatesLoading || createTemplateMutation.isPending || updateTemplateMutation.isPending || deleteTemplateMutation.isPending}
                error={templateError}
                onClearError={() => setTemplateError('')}
                copy={{
                  title: t.email.templates?.title || 'Email Templates',
                  description: 'Create and manage email templates.',
                  create: t.email.templates?.create || 'Create Template',
                  edit: t.email.templates?.edit || 'Edit Template',
                  delete: t.email.templates?.delete || 'Delete',
                  duplicate: t.email.templates?.duplicate || 'Duplicate',
                  templateName: t.email.templates?.name || 'Template Name',
                  templateNamePlaceholder: t.email.templates?.namePlaceholder || 'e.g., Meeting Follow-up',
                  subject: t.email.templates?.subject || 'Subject',
                  subjectPlaceholder: t.email.templates?.subjectPlaceholder || 'Email subject line',
                  category: t.email.templates?.category || 'Category',
                  body: t.email.templates?.body || 'Body',
                  setAsDefault: t.email.templates?.setDefault || 'Set as Default',
                  defaultBadge: 'Default',
                  save: t.common?.save || 'Save',
                  cancel: t.common?.cancel || 'Cancel',
                  deleteConfirmTitle: 'Delete Template',
                  deleteConfirmMessage: t.email.templates?.confirmDelete || 'Are you sure you want to delete this template?',
                  noTemplates: t.email.templates?.noTemplates || 'No templates yet.',
                }}
              />
            )}
            {s.selectedSection === 'scheduled' && (
              <ScheduledEmailsList
                copy={{
                  title: t.email.scheduledEmails.title,
                  noScheduled: t.email.scheduledEmails.noScheduled,
                  cancel: t.email.scheduledEmails.cancel,
                  cancelConfirm: t.email.scheduledEmails.cancelConfirm,
                  reschedule: t.email.scheduledEmails.reschedule,
                  scheduledFor: t.email.scheduledEmails.scheduledFor,
                  recipients: t.email.scheduledEmails.recipients,
                  status: t.email.scheduledEmails.status,
                }}
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

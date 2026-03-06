/**
 * Settings Copy Hook
 *
 * Builds copy/translation objects for each settings section.
 */

import { useMemo } from 'react';
import { useTranslations } from '@/lib/hooks/use-translations';

export function useSettingsCopy() {
  const t = useTranslations();
  const settingsCopy = useMemo(() => t.settings, [t]);

  const generalCopy = useMemo(() => ({
    title: settingsCopy.generalPanel?.title || 'General',
    description: settingsCopy.generalPanel?.description || '',
    appearanceTitle: settingsCopy.generalPanel?.appearanceTitle || 'Appearance',
    themeLabel: settingsCopy.generalPanel?.themeLabel || 'Theme',
    themeOptions: settingsCopy.generalPanel?.themeOptions || { light: 'Light', dark: 'Dark', system: 'System' },
    emailDensityLabel: settingsCopy.generalPanel?.emailDensityLabel || 'Email List Density',
    emailDensityDescription: settingsCopy.generalPanel?.emailDensityDescription || 'Adjust spacing in email lists',
    emailDensities: settingsCopy.generalPanel?.emailDensities || { comfortable: 'Comfortable', compact: 'Compact', spacious: 'Spacious' },
    languageTitle: settingsCopy.generalPanel?.languageTitle || 'Language',
    languageLabel: settingsCopy.generalPanel?.languageLabel || 'Language',
    timezoneLabel: settingsCopy.generalPanel?.timezoneLabel || 'Timezone',
    saveSuccess: settingsCopy.generalPanel?.saveSuccess || 'Saved',
    saveError: settingsCopy.generalPanel?.saveError || 'Failed',
    saving: settingsCopy.aiPanel?.saving || 'Saving...',
    save: 'Save',
  }), [settingsCopy]);

  const aiCopy = useMemo(() => ({
    title: settingsCopy.aiPanel?.title || 'AI',
    description: settingsCopy.aiPanel?.description || '',
    featuresTitle: settingsCopy.aiPanel?.featuresTitle || 'Features',
    featuresDescription: settingsCopy.aiPanel?.featuresDescription || '',
    smartRepliesTitle: settingsCopy.aiPanel?.smartRepliesTitle || 'Smart Replies',
    smartRepliesDescription: settingsCopy.aiPanel?.smartRepliesDescription || '',
    smartRepliesRequiresStarter: settingsCopy.aiPanel?.smartRepliesRequiresStarter || 'Requires Starter plan or higher',
    summarizationTitle: settingsCopy.aiPanel?.summarizationTitle || 'Summarization',
    summarizationDescription: settingsCopy.aiPanel?.summarizationDescription || '',
    summarizationRequiresStarter: settingsCopy.aiPanel?.summarizationRequiresStarter || 'Requires Starter plan or higher',
    schedulingTitle: settingsCopy.aiPanel?.schedulingTitle || 'Scheduling',
    schedulingDescription: settingsCopy.aiPanel?.schedulingDescription || '',
    triageTitle: settingsCopy.aiPanel?.triageTitle || 'Auto-Triage',
    triageDescription: settingsCopy.aiPanel?.triageDescription || 'Automatically prioritize and label incoming emails',
    triageRequiresPro: settingsCopy.aiPanel?.triageRequiresPro || 'Requires Professional plan',
    personalizationTitle: settingsCopy.aiPanel?.personalizationTitle || 'Personalization',
    personalizationDescription: settingsCopy.aiPanel?.personalizationDescription || '',
    roleLabel: settingsCopy.aiPanel?.roleLabel || 'Role',
    communicationLabel: settingsCopy.aiPanel?.communicationLabel || 'Communication',
    responseLengthLabel: settingsCopy.aiPanel?.responseLengthLabel || 'Length',
    proactivityLabel: settingsCopy.aiPanel?.proactivityLabel || 'Proactivity',
    autoApproveLabel: settingsCopy.aiPanel?.autoApproveLabel || 'Auto-Approve',
    autoApproveHint: settingsCopy.aiPanel?.autoApproveHint || '',
    savePreferences: settingsCopy.aiPanel?.savePreferences || 'Save',
    saving: settingsCopy.aiPanel?.saving || 'Saving...',
    openAssistant: settingsCopy.aiPanel?.openAssistant || 'Open AI',
    dataManagementTitle: settingsCopy.aiPanel?.dataManagementTitle || 'Data',
    dataManagementDescription: settingsCopy.aiPanel?.dataManagementDescription || '',
    clearMemory: settingsCopy.aiPanel?.clearMemory || 'Clear',
    // Toggle button labels (must match backend enums)
    styles: settingsCopy.aiPanel?.personalization?.styles || { FORMAL: 'Formal', CASUAL: 'Casual', TECHNICAL: 'Technical', CREATIVE: 'Creative' },
    lengths: settingsCopy.aiPanel?.personalization?.lengths || { BRIEF: 'Brief', MODERATE: 'Moderate', DETAILED: 'Detailed' },
    proactivityLevels: settingsCopy.aiPanel?.personalization?.proactivityLevels || { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' },
  }), [settingsCopy]);

  const accountsCopy = useMemo(() => ({
    title: settingsCopy.mailAccountsPanel?.title || 'Accounts',
    description: settingsCopy.mailAccountsPanel?.description || '',
    connectedTitle: settingsCopy.mailAccountsPanel?.connectedTitle || 'Connected',
    refreshTooltip: settingsCopy.mailAccountsPanel?.refreshTooltip || 'Refresh',
    syncAll: settingsCopy.mailAccountsPanel?.syncAll || 'Sync All',
    syncing: settingsCopy.mailAccountsPanel?.syncing || 'Syncing...',
    addTitle: settingsCopy.mailAccountsPanel?.addTitle || 'Add',
    addDescription: settingsCopy.mailAccountsPanel?.addDescription || '',
    // Provider limits
    limitTitle: t.providers.limits?.title || 'Account Limit',
    limitCurrent: t.providers.limits?.current || '{current} of {max} accounts',
    limitReachedTitle: t.providers.limits?.reachedTitle || 'Account Limit Reached',
    limitReachedMessage: t.providers.limits?.reachedMessage || 'You have reached the maximum email accounts on your plan.',
    limitUpgradePrompt: t.providers.limits?.upgradePrompt || 'Upgrade your plan to add more email accounts.',
    limitUpgradeButton: t.providers.limits?.upgradeButton || 'Upgrade Plan',
  }), [settingsCopy, t.providers.limits]);

  const accountCopy = useMemo(() => ({
    title: settingsCopy.accountPanel?.title || 'Account',
    description: settingsCopy.accountPanel?.description || '',
    profileTitle: settingsCopy.accountPanel?.profileTitle || 'Profile',
    fullName: settingsCopy.accountPanel?.fullName || 'Name',
    email: settingsCopy.accountPanel?.email || 'Email',
    role: settingsCopy.accountPanel?.role || 'Role',
    contactAdmin: settingsCopy.accountPanel?.contactAdmin || '',
    dangerZoneTitle: settingsCopy.accountPanel?.dangerZoneTitle || 'Danger',
    dangerZoneDescription: settingsCopy.accountPanel?.dangerZoneDescription || '',
    deleteAccount: settingsCopy.accountPanel?.deleteAccount || 'Delete',
    deleteDialogTitle: settingsCopy.accountPanel?.deleteDialogTitle || 'Delete',
    deleteDialogDescription: settingsCopy.accountPanel?.deleteDialogDescription || '',
    deleteDialogConfirmLabel: settingsCopy.accountPanel?.deleteDialogConfirmLabel || 'Type DELETE',
    deleteDialogCancel: settingsCopy.accountPanel?.deleteDialogCancel || 'Cancel',
    deleteDialogConfirm: settingsCopy.accountPanel?.deleteDialogConfirm || 'Delete',
    deleteDialogDeleting: settingsCopy.accountPanel?.deleteDialogDeleting || 'Deleting...',
    deleteDialogError: settingsCopy.accountPanel?.deleteDialogError || 'Error',
    avatar: settingsCopy.accountPanel?.avatar,
  }), [settingsCopy]);

  const signaturesCopy = useMemo(() => ({
    title: settingsCopy.signaturesPanel?.title || 'Email Signatures',
    description: settingsCopy.signaturesPanel?.description || 'Create and manage email signatures.',
    addSignature: settingsCopy.signaturesPanel?.addSignature || 'Add Signature',
    editSignature: settingsCopy.signaturesPanel?.editSignature || 'Edit Signature',
    deleteSignature: settingsCopy.signaturesPanel?.deleteSignature || 'Delete',
    signatureName: settingsCopy.signaturesPanel?.signatureName || 'Signature Name',
    signatureNamePlaceholder: settingsCopy.signaturesPanel?.signatureNamePlaceholder || 'e.g., Work, Personal',
    signatureContent: settingsCopy.signaturesPanel?.signatureContent || 'Signature Content',
    setAsDefault: settingsCopy.signaturesPanel?.setAsDefault || 'Set as Default',
    defaultBadge: settingsCopy.signaturesPanel?.defaultBadge || 'Default',
    save: settingsCopy.signaturesPanel?.save || 'Save',
    cancel: settingsCopy.signaturesPanel?.cancel || 'Cancel',
    deleteConfirmTitle: settingsCopy.signaturesPanel?.deleteConfirmTitle || 'Delete Signature',
    deleteConfirmMessage: settingsCopy.signaturesPanel?.deleteConfirmMessage || 'Are you sure you want to delete this signature?',
    noSignatures: settingsCopy.signaturesPanel?.noSignatures || 'No signatures yet.',
    previewTitle: settingsCopy.signaturesPanel?.previewTitle || 'Preview',
    provider: settingsCopy.signaturesPanel?.provider || 'Account',
    allProviders: settingsCopy.signaturesPanel?.allProviders || 'All accounts',
  }), [settingsCopy]);

  return {
    t, settingsCopy,
    generalCopy, aiCopy, accountsCopy, accountCopy, signaturesCopy,
  };
}

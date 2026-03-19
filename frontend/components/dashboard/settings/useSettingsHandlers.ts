/**
 * Settings Handlers Hook
 *
 * Centralizes all handler/callback functions for the Settings page.
 */

import { useCallback } from 'react';
import { usersApi } from '@/lib/api/users';
import { authClient } from '@/lib/auth-client';
import { persistUserSettings } from '@/lib/utils/user-settings';
import { logger } from '@/lib/logger';
import { resizeImage } from './settings-utils';
import type { useSettingsState } from './useSettingsState';
import type { SettingsSection } from './useSettingsState';

type State = ReturnType<typeof useSettingsState>;

export function useSettingsHandlers(s: State, settingsCopy: Record<string, any>) {
  const handleSectionSelect = useCallback(
    (sectionId: SettingsSection) => {
      s.setSelectedSection(sectionId);
      if (!s.router.isReady) return;
      s.router.replace({ pathname: s.router.pathname, query: { section: sectionId } }, undefined, { shallow: true });
    },
    [s.router, s.setSelectedSection],
  );

  const handleSaveSettings = useCallback(async () => {
    try {
      s.setSaveLoading(true);
      s.setGeneralError('');
      s.setGeneralSuccess('');
      await usersApi.updatePreferences({ language: s.language, timezone: s.timezone, emailDensity: s.emailDensity });
      persistUserSettings({ language: s.language, timezone: s.timezone, emailNotifications: s.emailNotifications });
      s.setGeneralSuccess(settingsCopy.generalPanel?.saveSuccess || 'Settings saved');
    } catch {
      s.setGeneralError(settingsCopy.generalPanel?.saveError || 'Failed to save');
    } finally {
      s.setSaveLoading(false);
    }
  }, [s.language, s.timezone, s.emailDensity, s.emailNotifications, s.setSaveLoading, s.setGeneralError, s.setGeneralSuccess, settingsCopy]);

  const handleSyncAll = useCallback(async () => {
    if (!confirm(settingsCopy.mailAccountsPanel?.syncConfirm || 'Sync all accounts?')) {
      return;
    }
    try {
      const result = await s.syncAllMutation.mutateAsync();
      if (result.success) {
        s.setProviderSuccess(result.message || settingsCopy.mailAccountsPanel?.syncStarted || 'Sync started');
      } else {
        s.setProviderError(result.message || 'Sync returned unsuccessful');
      }
    } catch {
      s.setProviderError(settingsCopy.mailAccountsPanel?.syncFailed || 'Sync failed');
    }
  }, [s.syncAllMutation, s.setProviderSuccess, s.setProviderError, settingsCopy]);

  const handleSaveAiProfile = useCallback(async () => {
    try {
      s.setAiError('');
      s.setAiSuccess('');
      const jobTitle = s.jobRole.trim();
      await s.updatePreferencesMutation.mutateAsync({
        aiSmartRepliesEnabled: s.smartRepliesEnabled,
        aiSummarizationEnabled: s.summarizationEnabled,
        aiSchedulingEnabled: s.schedulingEnabled,
        aiAutoTriageEnabled: s.triageEnabled,
        aiAutoApproveThreshold: s.autoApproveThreshold / 100,
        jobTitle: jobTitle || undefined,
        communicationStyle: s.communicationStyle,
        responseLength: s.responseLength,
        proactivityLevel: s.proactivityLevel,
      });
      s.setAiSuccess(settingsCopy.aiPanel?.savePreferences || 'Saved');
    } catch {
      s.setAiError(settingsCopy.generalPanel?.saveError || 'Failed to save');
    }
  }, [s.smartRepliesEnabled, s.summarizationEnabled, s.schedulingEnabled, s.triageEnabled, s.autoApproveThreshold, s.jobRole, s.communicationStyle, s.responseLength, s.proactivityLevel, s.updatePreferencesMutation, s.setAiError, s.setAiSuccess, settingsCopy]);

  const handleClearAiMemory = useCallback(async () => {
    if (
      !confirm(
        settingsCopy.aiPanel?.clearMemoryConfirm ||
          'This will delete your AI memory. Continue?',
      )
    ) {
      return;
    }

    try {
      s.setAiDataLoading(true);
      s.setAiError('');
      s.setAiSuccess('');
      await usersApi.clearAiMemory();
      s.setAiSuccess(settingsCopy.aiPanel?.clearMemory || 'Memory cleared');
    } catch {
      s.setAiError(settingsCopy.generalPanel?.saveError || 'Failed to save');
    } finally {
      s.setAiDataLoading(false);
    }
  }, [s.setAiDataLoading, s.setAiError, s.setAiSuccess, settingsCopy]);

  const handleDeleteAccount = useCallback(async () => {
    const confirmWord = s.language === 'it' ? 'ELIMINA' : 'DELETE';
    if (s.deleteConfirmText !== confirmWord) return;
    try {
      s.setDeleteLoading(true);
      s.setDeleteError('');
      await usersApi.deleteAccount();
      await s.logout();
      await s.router.push('/auth/login');
    } catch (error) {
      logger.error('Failed to delete account', { error });
      s.setDeleteError(settingsCopy.accountPanel?.deleteDialogError || 'Failed to delete');
    } finally {
      s.setDeleteLoading(false);
    }
  }, [s.deleteConfirmText, s.language, s.router, s.logout, s.setDeleteLoading, s.setDeleteError, settingsCopy]);

  const handleProviderInitiated = useCallback(() => s.setProviderSuccess('Redirecting...'), [s.setProviderSuccess]);
  const handleProviderConnected = useCallback(() => { s.setProviderSuccess('Connected'); s.refetchProviders(); }, [s.setProviderSuccess, s.refetchProviders]);
  const handleProviderDeleted = useCallback(() => { s.setProviderSuccess('Disconnected'); s.refetchProviders(); }, [s.setProviderSuccess, s.refetchProviders]);
  const handleCloseDeleteDialog = useCallback(() => { s.setDeleteDialogOpen(false); s.setDeleteConfirmText(''); s.setDeleteError(''); }, [s.setDeleteDialogOpen, s.setDeleteConfirmText, s.setDeleteError]);

  const handleAvatarUpload = useCallback(async (file: File) => {
    try {
      s.setAvatarUploading(true);
      const resizedDataUrl = await resizeImage(file);
      const result = await usersApi.uploadAvatar(resizedDataUrl);
      s.setAvatarUrl(result.avatarUrl);
    } catch (error) {
      logger.error('Failed to upload avatar', { error });
    } finally {
      s.setAvatarUploading(false);
    }
  }, [s.setAvatarUrl, s.setAvatarUploading]);

  const handleAvatarRemove = useCallback(async () => {
    try {
      s.setAvatarUploading(true);
      // Clear from better-auth session + R2 storage + DB
      await authClient.updateUser({ image: '' });
      await usersApi.deleteAvatar();
      s.setAvatarUrl(null);
    } catch (error) {
      logger.error('Failed to remove avatar', { error });
    } finally {
      s.setAvatarUploading(false);
    }
  }, [s.setAvatarUrl, s.setAvatarUploading]);

  const handleAvatarSave = useCallback(async (avatarValue: string) => {
    try {
      s.setAvatarUploading(true);

      const isUrl = avatarValue.startsWith('https://');

      if (isUrl) {
        // Small external URL (DiceBear etc.) — store via better-auth + sync avatarUrl
        await authClient.updateUser({ image: avatarValue });
        await usersApi.updateProfile({ avatarUrl: avatarValue });
        s.setAvatarUrl(avatarValue);
      } else {
        // Base64 data URL (photo upload) — upload to R2 via backend
        const result = await usersApi.uploadAvatar(avatarValue);
        s.setAvatarUrl(result.avatarUrl);
      }
    } catch (error) {
      logger.error('Failed to save avatar', { error });
      throw error;
    } finally {
      s.setAvatarUploading(false);
    }
  }, [s.setAvatarUrl, s.setAvatarUploading]);

  const handleSaveSignature = useCallback(async (signature: { id?: string; name: string; content: string; providerId: string | null; isDefault: boolean }) => {
    try {
      s.setSignatureError('');
      const providerId = signature.providerId ?? undefined;
      if (signature.id) {
        await s.updateSignatureMutation.mutateAsync({ id: signature.id, dto: { name: signature.name, content: signature.content, providerId, isDefault: signature.isDefault } });
      } else {
        await s.createSignatureMutation.mutateAsync({ name: signature.name, content: signature.content, providerId, isDefault: signature.isDefault });
      }
    } catch {
      s.setSignatureError('Failed to save signature');
    }
  }, [s.createSignatureMutation, s.updateSignatureMutation, s.setSignatureError]);

  const handleDeleteSignature = useCallback(async (id: string) => {
    try {
      s.setSignatureError('');
      await s.deleteSignatureMutation.mutateAsync(id);
    } catch {
      s.setSignatureError('Failed to delete signature');
    }
  }, [s.deleteSignatureMutation, s.setSignatureError]);

  const handleSetDefaultSignature = useCallback(async (id: string) => {
    try {
      s.setSignatureError('');
      await s.setDefaultSignatureMutation.mutateAsync(id);
    } catch {
      s.setSignatureError('Failed to set default signature');
    }
  }, [s.setDefaultSignatureMutation, s.setSignatureError]);

  return {
    handleSectionSelect,
    handleSaveSettings,
    handleSyncAll,
    handleSaveAiProfile,
    handleClearAiMemory,
    handleDeleteAccount,
    handleProviderInitiated,
    handleProviderConnected,
    handleProviderDeleted,
    handleCloseDeleteDialog,
    handleAvatarUpload,
    handleAvatarRemove,
    handleAvatarSave,
    handleSaveSignature,
    handleDeleteSignature,
    handleSetDefaultSignature,
  };
}

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
import type { useSettingsCopy } from './useSettingsCopy';
import type { SettingsSection } from './useSettingsState';

type State = ReturnType<typeof useSettingsState>;
type SettingsCopy = ReturnType<typeof useSettingsCopy>['settingsCopy'];

export function useSettingsHandlers(s: State, settingsCopy: SettingsCopy) {
  const {
    router,
    language,
    timezone,
    emailDensity,
    emailNotifications,
    setSelectedSection,
    setSaveLoading,
    setGeneralError,
    setGeneralSuccess,
    syncAllMutation,
    setProviderSuccess,
    setProviderError,
    refetchProviders,
    setAiError,
    setAiSuccess,
    setAiDataLoading,
    smartRepliesEnabled,
    summarizationEnabled,
    schedulingEnabled,
    triageEnabled,
    hitlSensitivity,
    jobRole,
    communicationStyle,
    responseLength,
    proactivityLevel,
    updatePreferencesMutation,
    deleteConfirmText,
    setDeleteLoading,
    setDeleteError,
    logout,
    setDeleteDialogOpen,
    setDeleteConfirmText,
    setAvatarUrl,
    setAvatarUploading,
    setSignatureError,
    createSignatureMutation,
    updateSignatureMutation,
    deleteSignatureMutation,
    setDefaultSignatureMutation,
  } = s;

  const generalSaveSuccess = settingsCopy.generalPanel?.saveSuccess || 'Settings saved';
  const generalSaveError = settingsCopy.generalPanel?.saveError || 'Failed to save';
  const syncConfirmMessage = settingsCopy.mailAccountsPanel?.syncConfirm || 'Sync all accounts?';
  const syncStartedMessage = settingsCopy.mailAccountsPanel?.syncStarted || 'Sync started';
  const syncFailedMessage = settingsCopy.mailAccountsPanel?.syncFailed || 'Sync failed';
  const aiSavedMessage = settingsCopy.aiPanel?.savePreferences || 'Saved';
  const clearAiMemoryConfirmMessage =
    settingsCopy.aiPanel?.clearMemoryConfirm || 'This will delete your AI memory. Continue?';
  const clearAiMemorySuccessMessage = settingsCopy.aiPanel?.clearMemory || 'Memory cleared';
  const deleteAccountError = settingsCopy.accountPanel?.deleteDialogError || 'Failed to delete';

  const handleSectionSelect = useCallback(
    (sectionId: SettingsSection) => {
      setSelectedSection(sectionId);
      if (!router.isReady) {
        return;
      }

      void router.replace(
        { pathname: router.pathname, query: { section: sectionId } },
        undefined,
        { shallow: true },
      );
    },
    [router, setSelectedSection],
  );

  const handleSaveSettings = useCallback(async () => {
    try {
      setSaveLoading(true);
      setGeneralError('');
      setGeneralSuccess('');
      await usersApi.updatePreferences({
        language,
        timezone,
        emailDensity,
      });
      persistUserSettings({
        language,
        timezone,
        emailNotifications,
      });
      setGeneralSuccess(generalSaveSuccess);
    } catch {
      setGeneralError(generalSaveError);
    } finally {
      setSaveLoading(false);
    }
  }, [
    emailDensity,
    emailNotifications,
    generalSaveError,
    generalSaveSuccess,
    language,
    setGeneralError,
    setGeneralSuccess,
    setSaveLoading,
    timezone,
  ]);

  const handleSyncAll = useCallback(async () => {
    if (!confirm(syncConfirmMessage)) {
      return;
    }

    try {
      const result = await syncAllMutation.mutateAsync();
      if (result.success) {
        setProviderSuccess(result.message || syncStartedMessage);
      } else {
        setProviderError(result.message || 'Sync returned unsuccessful');
      }
    } catch {
      setProviderError(syncFailedMessage);
    }
  }, [
    setProviderError,
    setProviderSuccess,
    syncAllMutation,
    syncConfirmMessage,
    syncFailedMessage,
    syncStartedMessage,
  ]);

  const handleSaveAiProfile = useCallback(async () => {
    try {
      setAiError('');
      setAiSuccess('');
      const normalizedJobTitle = jobRole.trim();

      await updatePreferencesMutation.mutateAsync({
        aiSmartRepliesEnabled: smartRepliesEnabled,
        aiSummarizationEnabled: summarizationEnabled,
        aiSchedulingEnabled: schedulingEnabled,
        aiAutoTriageEnabled: triageEnabled,
        hitlSensitivity,
        jobTitle: normalizedJobTitle || undefined,
        communicationStyle,
        responseLength,
        proactivityLevel,
      });

      setAiSuccess(aiSavedMessage);
    } catch {
      setAiError(generalSaveError);
    }
  }, [
    aiSavedMessage,
    hitlSensitivity,
    communicationStyle,
    generalSaveError,
    jobRole,
    proactivityLevel,
    responseLength,
    schedulingEnabled,
    setAiError,
    setAiSuccess,
    smartRepliesEnabled,
    summarizationEnabled,
    triageEnabled,
    updatePreferencesMutation,
  ]);

  const handleClearAiMemory = useCallback(async () => {
    if (!confirm(clearAiMemoryConfirmMessage)) {
      return;
    }

    try {
      setAiDataLoading(true);
      setAiError('');
      setAiSuccess('');
      await usersApi.clearAiMemory();
      setAiSuccess(clearAiMemorySuccessMessage);
    } catch {
      setAiError(generalSaveError);
    } finally {
      setAiDataLoading(false);
    }
  }, [
    clearAiMemoryConfirmMessage,
    clearAiMemorySuccessMessage,
    generalSaveError,
    setAiDataLoading,
    setAiError,
    setAiSuccess,
  ]);

  const handleDeleteAccount = useCallback(async () => {
    const confirmWord = language === 'it' ? 'ELIMINA' : 'DELETE';
    if (deleteConfirmText !== confirmWord) {
      return;
    }

    try {
      setDeleteLoading(true);
      setDeleteError('');
      await usersApi.deleteAccount();
      await logout();
      await router.push('/auth/login');
    } catch (error) {
      logger.error('Failed to delete account', { error });
      setDeleteError(deleteAccountError);
    } finally {
      setDeleteLoading(false);
    }
  }, [
    deleteAccountError,
    deleteConfirmText,
    language,
    logout,
    router,
    setDeleteError,
    setDeleteLoading,
  ]);

  const handleProviderInitiated = useCallback(() => {
    setProviderSuccess('Redirecting...');
  }, [setProviderSuccess]);

  const handleProviderConnected = useCallback(() => {
    setProviderSuccess('Connected');
    void refetchProviders();
  }, [refetchProviders, setProviderSuccess]);

  const handleProviderDeleted = useCallback(() => {
    setProviderSuccess('Disconnected');
    void refetchProviders();
  }, [refetchProviders, setProviderSuccess]);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setDeleteConfirmText('');
    setDeleteError('');
  }, [setDeleteConfirmText, setDeleteDialogOpen, setDeleteError]);

  const handleAvatarUpload = useCallback(async (file: File) => {
    try {
      setAvatarUploading(true);
      const resizedDataUrl = await resizeImage(file);
      const result = await usersApi.uploadAvatar(resizedDataUrl);
      setAvatarUrl(result.avatarUrl);
    } catch (error) {
      logger.error('Failed to upload avatar', { error });
    } finally {
      setAvatarUploading(false);
    }
  }, [setAvatarUploading, setAvatarUrl]);

  const handleAvatarRemove = useCallback(async () => {
    try {
      setAvatarUploading(true);
      await authClient.updateUser({ image: '' });
      await usersApi.deleteAvatar();
      setAvatarUrl(null);
    } catch (error) {
      logger.error('Failed to remove avatar', { error });
    } finally {
      setAvatarUploading(false);
    }
  }, [setAvatarUploading, setAvatarUrl]);

  const handleAvatarSave = useCallback(async (avatarValue: string) => {
    try {
      setAvatarUploading(true);

      if (avatarValue.startsWith('https://')) {
        await authClient.updateUser({ image: avatarValue });
        await usersApi.updateProfile({ avatarUrl: avatarValue });
        setAvatarUrl(avatarValue);
      } else {
        const result = await usersApi.uploadAvatar(avatarValue);
        setAvatarUrl(result.avatarUrl);
      }
    } catch (error) {
      logger.error('Failed to save avatar', { error });
      throw error;
    } finally {
      setAvatarUploading(false);
    }
  }, [setAvatarUploading, setAvatarUrl]);

  const handleSaveSignature = useCallback(async (signature: {
    id?: string;
    name: string;
    content: string;
    providerId: string | null;
    isDefault: boolean;
  }) => {
    try {
      setSignatureError('');
      const providerId = signature.providerId ?? undefined;

      if (signature.id) {
        await updateSignatureMutation.mutateAsync({
          id: signature.id,
          dto: {
            name: signature.name,
            content: signature.content,
            providerId,
            isDefault: signature.isDefault,
          },
        });
        return;
      }

      await createSignatureMutation.mutateAsync({
        name: signature.name,
        content: signature.content,
        providerId,
        isDefault: signature.isDefault,
      });
    } catch {
      setSignatureError('Failed to save signature');
    }
  }, [
    createSignatureMutation,
    setSignatureError,
    updateSignatureMutation,
  ]);

  const handleDeleteSignature = useCallback(async (id: string) => {
    try {
      setSignatureError('');
      await deleteSignatureMutation.mutateAsync(id);
    } catch {
      setSignatureError('Failed to delete signature');
    }
  }, [deleteSignatureMutation, setSignatureError]);

  const handleSetDefaultSignature = useCallback(async (id: string) => {
    try {
      setSignatureError('');
      await setDefaultSignatureMutation.mutateAsync(id);
    } catch {
      setSignatureError('Failed to set default signature');
    }
  }, [setDefaultSignatureMutation, setSignatureError]);

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

import { apiClient } from '../api-client';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

// Types
export interface MfaStatus {
  totpEnabled: boolean;
  backupCodesRemaining: number;
  trustedDevicesCount: number;
}

export interface TotpSetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  otpauthUrl: string;
}

export interface TotpVerifyResponse {
  success: boolean;
  message: string;
  backupCodes?: string[];
}

export interface TrustedDevice {
  id: string;
  deviceName: string;
  location?: string;
  isCurrent: boolean;
  lastUsedAt: string;
  createdAt: string;
}

export interface BackupCodesResponse {
  codes: string[];
  warning: string;
}

export interface WebAuthnCredential {
  id: string;
  deviceName: string;
  credentialDeviceType: 'singleDevice' | 'multiDevice';
  credentialBackedUp: boolean;
  transports: string[];
  lastUsedAt: string;
  createdAt: string;
}

// Re-export WebAuthn types from @simplewebauthn/browser for proper type compatibility
export type WebAuthnRegistrationOptions = PublicKeyCredentialCreationOptionsJSON;
export type WebAuthnAuthenticationOptions = PublicKeyCredentialRequestOptionsJSON;

// MFA API
export const mfaApi = {
  /**
   * Get MFA status for current user
   */
  getStatus: async (): Promise<MfaStatus> => {
    const response = await apiClient.get('/auth/mfa/status');
    return response.data;
  },

  // ==================== TOTP ====================

  /**
   * Generate TOTP secret and QR code for setup
   */
  setupTotp: async (): Promise<TotpSetupResponse> => {
    const response = await apiClient.post('/auth/mfa/totp/setup');
    return response.data;
  },

  /**
   * Verify TOTP code and activate
   */
  verifyTotp: async (code: string): Promise<TotpVerifyResponse> => {
    const response = await apiClient.post('/auth/mfa/totp/verify', { code });
    return response.data;
  },

  /**
   * Check if TOTP is enabled
   */
  getTotpStatus: async (): Promise<{ enabled: boolean }> => {
    const response = await apiClient.get('/auth/mfa/totp/status');
    return response.data;
  },

  /**
   * Disable TOTP (requires current code)
   */
  disableTotp: async (code: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete('/auth/mfa/totp', { data: { code } });
    return response.data;
  },

  // ==================== BACKUP CODES ====================

  /**
   * Generate new backup codes (invalidates existing)
   */
  generateBackupCodes: async (): Promise<BackupCodesResponse> => {
    const response = await apiClient.post('/auth/mfa/backup/generate');
    return response.data;
  },

  /**
   * Get remaining backup codes count
   */
  getBackupCodesCount: async (): Promise<{ remaining: number }> => {
    const response = await apiClient.get('/auth/mfa/backup/count');
    return response.data;
  },

  // ==================== TRUSTED DEVICES ====================

  /**
   * List trusted devices
   */
  listDevices: async (): Promise<TrustedDevice[]> => {
    const response = await apiClient.get('/auth/mfa/devices');
    return response.data;
  },

  /**
   * Revoke a specific trusted device
   */
  revokeDevice: async (deviceId: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/auth/mfa/devices/${deviceId}`);
    return response.data;
  },

  /**
   * Revoke all trusted devices
   */
  revokeAllDevices: async (): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete('/auth/mfa/devices');
    return response.data;
  },

  /**
   * Trust current device
   */
  trustCurrentDevice: async (): Promise<{ deviceToken: string; expiresAt: string }> => {
    const response = await apiClient.post('/auth/mfa/devices/trust');
    return response.data;
  },

  // ==================== WEBAUTHN / PASSKEYS ====================

  /**
   * Get WebAuthn registration options for passkey setup
   */
  getWebAuthnRegistrationOptions: async (): Promise<WebAuthnRegistrationOptions> => {
    const response = await apiClient.post('/auth/mfa/webauthn/register/options');
    return response.data;
  },

  /**
   * Verify WebAuthn registration and save passkey
   */
  verifyWebAuthnRegistration: async (
    credential: unknown,
    deviceName?: string,
  ): Promise<{ success: boolean; credentialId?: string; error?: string }> => {
    const response = await apiClient.post('/auth/mfa/webauthn/register/verify', {
      response: credential,
      deviceName,
    });
    return response.data;
  },

  /**
   * List WebAuthn credentials
   */
  listWebAuthnCredentials: async (): Promise<WebAuthnCredential[]> => {
    const response = await apiClient.get('/auth/mfa/webauthn/credentials');
    return response.data;
  },

  /**
   * Update WebAuthn credential name
   */
  updateWebAuthnCredentialName: async (
    credentialId: string,
    deviceName: string,
  ): Promise<{ success: boolean }> => {
    const response = await apiClient.patch(`/auth/mfa/webauthn/credentials/${credentialId}`, {
      deviceName,
    });
    return response.data;
  },

  /**
   * Delete a WebAuthn credential
   */
  deleteWebAuthnCredential: async (
    credentialId: string,
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/auth/mfa/webauthn/credentials/${credentialId}`);
    return response.data;
  },

  /**
   * Get WebAuthn authentication options
   */
  getWebAuthnAuthenticationOptions: async (): Promise<{
    options: WebAuthnAuthenticationOptions;
    sessionId: string;
  }> => {
    const response = await apiClient.post('/auth/mfa/webauthn/authenticate/options');
    return response.data;
  },

  /**
   * Verify WebAuthn authentication
   */
  verifyWebAuthnAuthentication: async (
    credential: unknown,
    sessionId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await apiClient.post('/auth/mfa/webauthn/authenticate/verify', {
      response: credential,
      sessionId,
    });
    return response.data;
  },
};

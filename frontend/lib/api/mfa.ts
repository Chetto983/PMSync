import { apiClient } from '../api-client';

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
};

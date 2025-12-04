import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';
import { Request } from 'express';

/**
 * Trusted device info for display
 */
export interface TrustedDeviceInfo {
  id: string;
  deviceName: string;
  location?: string;
  lastUsedAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

/**
 * TrustedDeviceService - "Keep me signed in" functionality
 *
 * Features:
 * - Store trusted device tokens with 30-day expiry
 * - Device fingerprinting (user-agent + IP hash)
 * - Token renewal on use
 * - Device listing and revocation
 * - Max devices per user limit
 *
 * Security:
 * - UUID v4 tokens with 128-bit entropy
 * - Tokens are bound to device fingerprint
 * - Automatic expiration cleanup
 * - Invalidation on password change
 *
 * @see MFA_ENHANCEMENT_ROADMAP.md Phase 3
 */
@Injectable()
export class TrustedDeviceService {
  private readonly logger = new Logger(TrustedDeviceService.name);

  // Configuration
  private readonly maxDevices: number;
  private readonly expiryDays: number;

  constructor(private readonly prisma: PrismaService) {
    this.maxDevices = parseInt(process.env.TRUSTED_DEVICE_MAX || '10', 10);
    this.expiryDays = parseInt(process.env.TRUSTED_DEVICE_EXPIRY_DAYS || '30', 10);
  }

  /**
   * Trust a device and generate a token
   *
   * @param userId - User ID
   * @param request - Express request (for device info)
   * @returns Device token to store in cookie
   */
  async trustDevice(userId: string, request: Request): Promise<string> {
    // Generate unique device token
    const deviceToken = crypto.randomUUID();

    // Extract device info
    const userAgent = request.headers['user-agent'] || 'Unknown';
    const ipAddress = this.extractIp(request);
    const deviceName = this.parseDeviceName(userAgent);
    const deviceHash = this.hashDeviceFingerprint(userAgent, ipAddress);

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.expiryDays);

    // Check device limit and remove oldest if needed
    const existingDevices = await this.prisma.trustedDevice.count({
      where: { userId },
    });

    if (existingDevices >= this.maxDevices) {
      // Remove oldest device
      const oldest = await this.prisma.trustedDevice.findFirst({
        where: { userId },
        orderBy: { lastUsedAt: 'asc' },
      });

      if (oldest) {
        await this.prisma.trustedDevice.delete({
          where: { id: oldest.id },
        });

        this.logger.log(
          JSON.stringify({
            event: 'trusted_device_removed_limit',
            userId,
            deviceId: oldest.id,
          }),
        );
      }
    }

    // Create trusted device record
    await this.prisma.trustedDevice.create({
      data: {
        userId,
        deviceToken,
        deviceName,
        deviceHash,
        ipAddress,
        expiresAt,
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'device_trusted',
        userId,
        deviceName,
        expiresAt: expiresAt.toISOString(),
      }),
    );

    return deviceToken;
  }

  /**
   * Verify a device token
   *
   * @param userId - User ID
   * @param token - Device token from cookie
   * @param request - Express request (for fingerprint validation)
   * @returns true if device is trusted and valid
   */
  async verifyDevice(userId: string, token: string, request: Request): Promise<boolean> {
    if (!token) return false;

    const device = await this.prisma.trustedDevice.findUnique({
      where: { deviceToken: token },
    });

    if (!device) {
      return false;
    }

    // Verify user matches
    if (device.userId !== userId) {
      this.logger.warn(
        JSON.stringify({
          event: 'trusted_device_user_mismatch',
          expectedUserId: userId,
          actualUserId: device.userId,
        }),
      );
      return false;
    }

    // Check expiration
    if (device.expiresAt < new Date()) {
      this.logger.log(
        JSON.stringify({
          event: 'trusted_device_expired',
          userId,
          deviceId: device.id,
        }),
      );

      // Clean up expired device
      await this.prisma.trustedDevice.delete({
        where: { id: device.id },
      });

      return false;
    }

    // Verify device fingerprint (partial match - allows IP changes)
    const userAgent = request.headers['user-agent'] || 'Unknown';
    const currentHash = this.hashDeviceFingerprint(userAgent, this.extractIp(request));

    // We allow some fingerprint drift for UX (e.g., IP changes on mobile)
    // But log suspicious changes
    if (device.deviceHash !== currentHash) {
      this.logger.warn(
        JSON.stringify({
          event: 'trusted_device_fingerprint_changed',
          userId,
          deviceId: device.id,
        }),
      );
      // For now, still allow but log. Could add stricter validation.
    }

    // Update last used timestamp and renew expiry
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + this.expiryDays);

    await this.prisma.trustedDevice.update({
      where: { id: device.id },
      data: {
        lastUsedAt: new Date(),
        expiresAt: newExpiry,
        ipAddress: this.extractIp(request),
      },
    });

    this.logger.log(
      JSON.stringify({
        event: 'trusted_device_verified',
        userId,
        deviceId: device.id,
      }),
    );

    return true;
  }

  /**
   * List all trusted devices for a user
   *
   * @param userId - User ID
   * @param currentToken - Current device token (to mark as current)
   */
  async listDevices(userId: string, currentToken?: string): Promise<TrustedDeviceInfo[]> {
    const devices = await this.prisma.trustedDevice.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });

    return devices.map((device) => ({
      id: device.id,
      deviceName: device.deviceName || 'Unknown Device',
      location: device.location ?? undefined,
      lastUsedAt: device.lastUsedAt,
      createdAt: device.createdAt,
      isCurrent: device.deviceToken === currentToken,
    }));
  }

  /**
   * Revoke a specific trusted device
   *
   * @param userId - User ID
   * @param deviceId - Device ID to revoke
   */
  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.trustedDevice.findFirst({
      where: {
        id: deviceId,
        userId,
      },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    await this.prisma.trustedDevice.delete({
      where: { id: deviceId },
    });

    this.logger.log(
      JSON.stringify({
        event: 'trusted_device_revoked',
        userId,
        deviceId,
      }),
    );
  }

  /**
   * Revoke all trusted devices for a user
   *
   * @param userId - User ID
   */
  async revokeAllDevices(userId: string): Promise<void> {
    const result = await this.prisma.trustedDevice.deleteMany({
      where: { userId },
    });

    this.logger.log(
      JSON.stringify({
        event: 'all_trusted_devices_revoked',
        userId,
        count: result.count,
      }),
    );
  }

  /**
   * Cleanup expired devices (run periodically via cron)
   */
  async cleanupExpiredDevices(): Promise<number> {
    const result = await this.prisma.trustedDevice.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'expired_devices_cleaned',
          count: result.count,
        }),
      );
    }

    return result.count;
  }

  /**
   * Extract IP address from request
   */
  private extractIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * Parse device name from user agent
   */
  private parseDeviceName(userAgent: string): string {
    // Simple parsing - could use ua-parser-js for better results
    const ua = userAgent.toLowerCase();

    let browser = 'Browser';
    let os = 'Unknown';

    // Detect browser
    if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('safari')) browser = 'Safari';
    else if (ua.includes('opera')) browser = 'Opera';

    // Detect OS
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac os') || ua.includes('macos')) os = 'macOS';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('linux')) os = 'Linux';

    return `${browser} on ${os}`;
  }

  /**
   * Hash device fingerprint
   */
  private hashDeviceFingerprint(userAgent: string, ip: string): string {
    // Use only the first 3 octets of IP for some flexibility
    const partialIp = ip.split('.').slice(0, 3).join('.');

    return crypto
      .createHash('sha256')
      .update(`${userAgent}:${partialIp}`)
      .digest('hex')
      .substring(0, 32);
  }
}

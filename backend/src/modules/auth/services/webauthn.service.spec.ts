import { Test, TestingModule } from '@nestjs/testing';
import { WebAuthnService, WebAuthnCredentialInfo } from './webauthn.service';
import { PrismaService } from '../../../prisma/prisma.service';
import * as simplewebauthn from '@simplewebauthn/server';
import {describe, it, expect, beforeEach, jest} from '@jest/globals';

// Mock @simplewebauthn/server
jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

describe('WebAuthnService', () => {
  let service: WebAuthnService;

  const mockPrismaService = {
    webAuthnCredential: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockUserId = 'user-123';
  const mockUserEmail = 'test@example.com';
  const mockCredentialId = 'cred-abc123';
  const mockCredentialIdBase64 = 'Y3JlZC1hYmMxMjM';
  const mockPublicKeyBase64 = 'cHVibGljLWtleS1kYXRh';

  beforeEach(async () => {
    // Set environment variables for testing
    process.env.WEBAUTHN_RP_NAME = 'TestApp';
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:3000';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebAuthnService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WebAuthnService>(WebAuthnService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('generateRegistrationOptions', () => {
    it('should generate registration options for a new user', async () => {
      const mockOptions = {
        challenge: 'test-challenge-base64url',
        rp: { name: 'TestApp', id: 'localhost' },
        user: {
          id: mockUserId,
          name: mockUserEmail,
          displayName: mockUserEmail,
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
      };

      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue(mockOptions);

      const result = await service.generateRegistrationOptions(mockUserId, mockUserEmail);

      expect(result).toEqual(mockOptions);
      expect(mockPrismaService.webAuthnCredential.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        select: { credentialId: true, transports: true },
      });
      expect(simplewebauthn.generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpName: 'TestApp',
          rpID: 'localhost',
          userName: mockUserEmail,
          userDisplayName: mockUserEmail,
          attestationType: 'none',
          excludeCredentials: [],
        }),
      );
    });

    it('should exclude existing credentials from registration options', async () => {
      const existingCredentials = [
        { credentialId: 'existing-cred-1', transports: ['internal'] },
        { credentialId: 'existing-cred-2', transports: ['usb'] },
      ];

      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue(existingCredentials);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'test-challenge',
      });

      await service.generateRegistrationOptions(mockUserId, mockUserEmail);

      expect(simplewebauthn.generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeCredentials: [
            { id: 'existing-cred-1', transports: ['internal'] },
            { id: 'existing-cred-2', transports: ['usb'] },
          ],
        }),
      );
    });

    it('should use custom display name when provided', async () => {
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'test-challenge',
      });

      await service.generateRegistrationOptions(mockUserId, mockUserEmail, 'John Doe');

      expect(simplewebauthn.generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          userDisplayName: 'John Doe',
        }),
      );
    });
  });

  describe('verifyRegistration', () => {
    const mockRegistrationResponse = {
      id: mockCredentialIdBase64,
      rawId: mockCredentialIdBase64,
      response: {
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
        attestationObject: 'o2NmbXRkbm9uZQ',
        transports: ['internal'],
      },
      authenticatorAttachment: 'platform' as const,
      clientExtensionResults: {},
      type: 'public-key' as const,
    };

    it('should verify and save a valid registration', async () => {
      // First generate options to store the challenge
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'test-challenge-base64url',
      });
      await service.generateRegistrationOptions(mockUserId, mockUserEmail);

      // Mock verification success
      (simplewebauthn.verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: new Uint8Array([1, 2, 3, 4]),
            publicKey: new Uint8Array([5, 6, 7, 8]),
            counter: 0,
          },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          aaguid: 'test-aaguid',
        },
      });

      mockPrismaService.webAuthnCredential.create.mockResolvedValue({
        id: mockCredentialId,
        userId: mockUserId,
        credentialId: mockCredentialIdBase64,
        credentialPublicKey: mockPublicKeyBase64,
        counter: 0,
      });

      const result = await service.verifyRegistration(mockUserId, mockRegistrationResponse);

      expect(result.success).toBe(true);
      expect(result.credentialId).toBe(mockCredentialId);
      expect(mockPrismaService.webAuthnCredential.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUserId,
            counter: 0,
            credentialDeviceType: 'multiDevice',
            credentialBackedUp: true,
            transports: ['internal'],
          }),
        }),
      );
    });

    it('should return error if no registration challenge exists', async () => {
      const result = await service.verifyRegistration('unknown-user', mockRegistrationResponse);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No registration challenge found. Please try again.');
    });

    it('should return error if challenge has expired', async () => {
      // Generate options
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'test-challenge',
      });
      await service.generateRegistrationOptions(mockUserId, mockUserEmail);

      // Manually expire the challenge by manipulating the internal map
      const challengesMap = service['registrationChallenges'];
      const session = challengesMap.get(mockUserId);
      if (session) {
        session.createdAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      }

      const result = await service.verifyRegistration(mockUserId, mockRegistrationResponse);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Registration challenge expired. Please try again.');
    });

    it('should return error if verification fails', async () => {
      // Generate options
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'test-challenge',
      });
      await service.generateRegistrationOptions(mockUserId, mockUserEmail);

      // Mock verification failure
      (simplewebauthn.verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: false,
        registrationInfo: null,
      });

      const result = await service.verifyRegistration(mockUserId, mockRegistrationResponse);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification failed');
    });

    it('should return error if verification throws an exception', async () => {
      // Generate options
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'test-challenge',
      });
      await service.generateRegistrationOptions(mockUserId, mockUserEmail);

      // Mock verification throwing an error
      (simplewebauthn.verifyRegistrationResponse as jest.Mock).mockRejectedValue(
        new Error('Invalid attestation'),
      );

      const result = await service.verifyRegistration(mockUserId, mockRegistrationResponse);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification failed. Please try again.');
    });
  });

  describe('generateAuthenticationOptions', () => {
    it('should generate authentication options with user credentials', async () => {
      const mockCredentials = [
        { credentialId: 'cred-1', transports: ['internal'] },
        { credentialId: 'cred-2', transports: ['usb'] },
      ];

      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue(mockCredentials);
      (simplewebauthn.generateAuthenticationOptions as jest.Mock).mockResolvedValue({
        challenge: 'auth-challenge-base64url',
        rpId: 'localhost',
        allowCredentials: mockCredentials.map((c) => ({
          id: c.credentialId,
          transports: c.transports,
        })),
      });

      const result = await service.generateAuthenticationOptions(mockUserId);

      expect(result.options.challenge).toBe('auth-challenge-base64url');
      expect(result.sessionId).toBeDefined();
      expect(simplewebauthn.generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'localhost',
          userVerification: 'required',
          allowCredentials: [
            { id: 'cred-1', transports: ['internal'] },
            { id: 'cred-2', transports: ['usb'] },
          ],
        }),
      );
    });

    it('should generate discoverable credential options without userId', async () => {
      (simplewebauthn.generateAuthenticationOptions as jest.Mock).mockResolvedValue({
        challenge: 'auth-challenge-base64url',
        rpId: 'localhost',
      });

      const result = await service.generateAuthenticationOptions();

      expect(result.options.challenge).toBe('auth-challenge-base64url');
      expect(result.sessionId).toBeDefined();
      expect(simplewebauthn.generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'localhost',
          userVerification: 'required',
          allowCredentials: undefined,
        }),
      );
    });
  });

  describe('verifyAuthentication', () => {
    const mockAuthResponse = {
      id: mockCredentialIdBase64,
      rawId: mockCredentialIdBase64,
      response: {
        clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
        authenticatorData: 'auth-data-base64',
        signature: 'signature-base64',
        userHandle: mockUserId,
      },
      authenticatorAttachment: 'platform' as const,
      clientExtensionResults: {},
      type: 'public-key' as const,
    };

    it('should verify a valid authentication', async () => {
      // First generate options
      (simplewebauthn.generateAuthenticationOptions as jest.Mock).mockResolvedValue({
        challenge: 'auth-challenge',
      });
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      const { sessionId } = await service.generateAuthenticationOptions(mockUserId);

      // Mock credential lookup
      mockPrismaService.webAuthnCredential.findUnique.mockResolvedValue({
        id: mockCredentialId,
        userId: mockUserId,
        credentialId: mockCredentialIdBase64,
        credentialPublicKey: mockPublicKeyBase64,
        counter: 0,
        transports: ['internal'],
        user: { id: mockUserId, email: mockUserEmail },
      });

      // Mock verification success
      (simplewebauthn.verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        authenticationInfo: {
          newCounter: 1,
        },
      });

      mockPrismaService.webAuthnCredential.update.mockResolvedValue({});

      const result = await service.verifyAuthentication(mockAuthResponse, sessionId, mockUserId);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(mockUserId);
      expect(mockPrismaService.webAuthnCredential.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockCredentialId },
          data: expect.objectContaining({
            counter: 1,
          }),
        }),
      );
    });

    it('should return error if credential is not found', async () => {
      mockPrismaService.webAuthnCredential.findUnique.mockResolvedValue(null);

      const result = await service.verifyAuthentication(mockAuthResponse, 'some-session');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credential not found');
    });

    it('should return error if no authentication challenge exists', async () => {
      mockPrismaService.webAuthnCredential.findUnique.mockResolvedValue({
        id: mockCredentialId,
        userId: mockUserId,
        credentialId: mockCredentialIdBase64,
        credentialPublicKey: mockPublicKeyBase64,
        counter: 0,
        transports: ['internal'],
        user: { id: mockUserId, email: mockUserEmail },
      });

      const result = await service.verifyAuthentication(mockAuthResponse, 'invalid-session');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No authentication challenge found. Please try again.');
    });

    it('should return error if verification fails', async () => {
      // Generate options
      (simplewebauthn.generateAuthenticationOptions as jest.Mock).mockResolvedValue({
        challenge: 'auth-challenge',
      });
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      const { sessionId } = await service.generateAuthenticationOptions(mockUserId);

      mockPrismaService.webAuthnCredential.findUnique.mockResolvedValue({
        id: mockCredentialId,
        userId: mockUserId,
        credentialId: mockCredentialIdBase64,
        credentialPublicKey: mockPublicKeyBase64,
        counter: 0,
        transports: ['internal'],
        user: { id: mockUserId, email: mockUserEmail },
      });

      (simplewebauthn.verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
        verified: false,
      });

      const result = await service.verifyAuthentication(mockAuthResponse, sessionId, mockUserId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication verification failed');
    });
  });

  describe('listCredentials', () => {
    it('should return list of credentials for a user', async () => {
      const mockCredentials = [
        {
          id: 'cred-1',
          deviceName: 'MacBook Touch ID',
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          transports: ['internal'],
          lastUsedAt: new Date('2024-01-15'),
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'cred-2',
          deviceName: 'YubiKey',
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
          transports: ['usb'],
          lastUsedAt: new Date('2024-01-10'),
          createdAt: new Date('2024-01-05'),
        },
      ];

      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue(mockCredentials);

      const result = await service.listCredentials(mockUserId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual<WebAuthnCredentialInfo>({
        id: 'cred-1',
        deviceName: 'MacBook Touch ID',
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        transports: ['internal'],
        lastUsedAt: new Date('2024-01-15'),
        createdAt: new Date('2024-01-01'),
      });
      expect(mockPrismaService.webAuthnCredential.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { lastUsedAt: 'desc' },
      });
    });

    it('should return empty array if no credentials exist', async () => {
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);

      const result = await service.listCredentials(mockUserId);

      expect(result).toEqual([]);
    });

    it('should use "Unknown Device" for credentials without device name', async () => {
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([
        {
          id: 'cred-1',
          deviceName: null,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
          transports: [],
          lastUsedAt: new Date(),
          createdAt: new Date(),
        },
      ]);

      const result = await service.listCredentials(mockUserId);

      expect(result[0].deviceName).toBe('Unknown Device');
    });
  });

  describe('deleteCredential', () => {
    it('should delete a credential belonging to the user', async () => {
      mockPrismaService.webAuthnCredential.findFirst.mockResolvedValue({
        id: mockCredentialId,
        userId: mockUserId,
      });
      mockPrismaService.webAuthnCredential.delete.mockResolvedValue({});

      const result = await service.deleteCredential(mockUserId, mockCredentialId);

      expect(result).toBe(true);
      expect(mockPrismaService.webAuthnCredential.delete).toHaveBeenCalledWith({
        where: { id: mockCredentialId },
      });
    });

    it('should return false if credential does not exist', async () => {
      mockPrismaService.webAuthnCredential.findFirst.mockResolvedValue(null);

      const result = await service.deleteCredential(mockUserId, 'non-existent');

      expect(result).toBe(false);
      expect(mockPrismaService.webAuthnCredential.delete).not.toHaveBeenCalled();
    });

    it('should return false if credential belongs to another user', async () => {
      mockPrismaService.webAuthnCredential.findFirst.mockResolvedValue(null);

      const result = await service.deleteCredential('other-user', mockCredentialId);

      expect(result).toBe(false);
    });
  });

  describe('hasCredentials', () => {
    it('should return true if user has credentials', async () => {
      mockPrismaService.webAuthnCredential.count.mockResolvedValue(2);

      const result = await service.hasCredentials(mockUserId);

      expect(result).toBe(true);
      expect(mockPrismaService.webAuthnCredential.count).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
    });

    it('should return false if user has no credentials', async () => {
      mockPrismaService.webAuthnCredential.count.mockResolvedValue(0);

      const result = await service.hasCredentials(mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('updateCredentialName', () => {
    it('should update credential device name', async () => {
      mockPrismaService.webAuthnCredential.findFirst.mockResolvedValue({
        id: mockCredentialId,
        userId: mockUserId,
      });
      mockPrismaService.webAuthnCredential.update.mockResolvedValue({});

      const result = await service.updateCredentialName(mockUserId, mockCredentialId, 'My iPhone');

      expect(result).toBe(true);
      expect(mockPrismaService.webAuthnCredential.update).toHaveBeenCalledWith({
        where: { id: mockCredentialId },
        data: { deviceName: 'My iPhone' },
      });
    });

    it('should return false if credential does not exist', async () => {
      mockPrismaService.webAuthnCredential.findFirst.mockResolvedValue(null);

      const result = await service.updateCredentialName(mockUserId, 'non-existent', 'New Name');

      expect(result).toBe(false);
      expect(mockPrismaService.webAuthnCredential.update).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredChallenges', () => {
    it('should remove expired registration challenges', async () => {
      // Add an expired challenge
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      (simplewebauthn.generateRegistrationOptions as jest.Mock).mockResolvedValue({
        challenge: 'test-challenge',
      });
      await service.generateRegistrationOptions('expired-user', 'expired@test.com');

      // Manually expire it
      const challengesMap = service['registrationChallenges'];
      const session = challengesMap.get('expired-user');
      if (session) {
        session.createdAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      }

      // Add a valid challenge
      await service.generateRegistrationOptions('valid-user', 'valid@test.com');

      // Run cleanup
      service.cleanupExpiredChallenges();

      // Expired should be removed, valid should remain
      expect(challengesMap.has('expired-user')).toBe(false);
      expect(challengesMap.has('valid-user')).toBe(true);
    });

    it('should remove expired authentication challenges', async () => {
      // Add an expired challenge
      (simplewebauthn.generateAuthenticationOptions as jest.Mock).mockResolvedValue({
        challenge: 'auth-challenge',
      });
      mockPrismaService.webAuthnCredential.findMany.mockResolvedValue([]);
      await service.generateAuthenticationOptions('expired-user');

      // Manually expire it
      const challengesMap = service['authenticationChallenges'];
      const session = challengesMap.get('expired-user');
      if (session) {
        session.createdAt = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      }

      // Add a valid challenge
      await service.generateAuthenticationOptions('valid-user');

      // Run cleanup
      service.cleanupExpiredChallenges();

      // Expired should be removed, valid should remain
      expect(challengesMap.has('expired-user')).toBe(false);
      expect(challengesMap.has('valid-user')).toBe(true);
    });
  });

  describe('generateDeviceName', () => {
    it('should identify platform authenticator as Platform Authenticator', () => {
      const response = {
        id: 'test',
        rawId: 'test',
        response: {
          clientDataJSON: '',
          attestationObject: '',
          transports: ['internal'] as const,
        },
        clientExtensionResults: {},
        type: 'public-key' as const,
      };

      // Use the private method via bracket notation
      const result = service['generateDeviceName'](response);

      expect(result).toBe('Platform Authenticator');
    });

    it('should identify USB security key', () => {
      const response = {
        id: 'test',
        rawId: 'test',
        response: {
          clientDataJSON: '',
          attestationObject: '',
          transports: ['usb'] as const,
        },
        clientExtensionResults: {},
        type: 'public-key' as const,
      };

      const result = service['generateDeviceName'](response);

      expect(result).toBe('USB Security Key');
    });

    it('should identify NFC security key', () => {
      const response = {
        id: 'test',
        rawId: 'test',
        response: {
          clientDataJSON: '',
          attestationObject: '',
          transports: ['nfc'] as const,
        },
        clientExtensionResults: {},
        type: 'public-key' as const,
      };

      const result = service['generateDeviceName'](response);

      expect(result).toBe('NFC Security Key');
    });

    it('should identify hybrid (phone) authenticator', () => {
      const response = {
        id: 'test',
        rawId: 'test',
        response: {
          clientDataJSON: '',
          attestationObject: '',
          transports: ['hybrid'] as const,
        },
        clientExtensionResults: {},
        type: 'public-key' as const,
      };

      const result = service['generateDeviceName'](response);

      expect(result).toBe('Phone as Security Key');
    });

    it('should default to Security Key for unknown transports', () => {
      const response = {
        id: 'test',
        rawId: 'test',
        response: {
          clientDataJSON: '',
          attestationObject: '',
          transports: undefined,
        },
        clientExtensionResults: {},
        type: 'public-key' as const,
      };

      const result = service['generateDeviceName'](response);

      expect(result).toBe('Security Key');
    });
  });
});

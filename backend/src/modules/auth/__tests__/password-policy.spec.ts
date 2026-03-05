import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PasswordPolicyService } from '../services/password-policy.service';
import { RegisterDto } from '../dtos/register.dto';
import { ResetPasswordDto } from '../dtos/reset-password.dto';
import { LoginDto } from '../dtos/login.dto';

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordPolicyService],
    }).compile();

    service = module.get(PasswordPolicyService);
  });

  describe('validate - length checks', () => {
    it('should reject password shorter than 8 characters', async () => {
      const result = await service.validate('short');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('should reject password longer than 128 characters', async () => {
      const result = await service.validate('a'.repeat(129));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at most 128 characters');
    });

    it('should accept password with exactly 8 characters (HIBP mocked as clean)', async () => {
      // Override checkBreached to avoid real network call
      jest.spyOn(service, 'checkBreached').mockResolvedValueOnce({ breached: false, count: 0 });
      const result = await service.validate('a'.repeat(8));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept password with exactly 128 characters', async () => {
      jest.spyOn(service, 'checkBreached').mockResolvedValueOnce({ breached: false, count: 0 });
      const result = await service.validate('a'.repeat(128));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validate - HIBP breach check', () => {
    it('should reject password found in >3 breaches', async () => {
      jest.spyOn(service, 'checkBreached').mockResolvedValueOnce({ breached: true, count: 5000 });
      const result = await service.validate('a'.repeat(8));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('This password has appeared in data breaches and cannot be used');
    });

    it('should accept password found in <=3 breaches', async () => {
      jest.spyOn(service, 'checkBreached').mockResolvedValueOnce({ breached: false, count: 2 });
      const result = await service.validate('a'.repeat(8));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should accept password when HIBP API is unreachable (best-effort)', async () => {
      jest.spyOn(service, 'checkBreached').mockResolvedValueOnce({ breached: false, count: 0 });
      const result = await service.validate('a'.repeat(8));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('checkBreached', () => {
    it('should return breached=false, count=0 when fetch throws', async () => {
      // Mock global fetch to throw
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
      try {
        const result = await service.checkBreached('any-password-1234');
        expect(result).toEqual({ breached: false, count: 0 });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

describe('DTO Validation - MinLength(8) and MaxLength(128)', () => {
  describe('RegisterDto', () => {
    it('should reject password with 7 chars', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'a'.repeat(7),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeDefined();
    });

    it('should reject password with 129 chars', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'a'.repeat(129),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeDefined();
    });

    it('should accept password with 8 chars', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'a'.repeat(8),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeUndefined();
    });

    it('should accept password with 128 chars', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'a'.repeat(128),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeUndefined();
    });
  });

  describe('ResetPasswordDto', () => {
    it('should reject newPassword with 7 chars', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'some-token',
        newPassword: 'a'.repeat(7),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'newPassword');
      expect(pwError).toBeDefined();
    });

    it('should reject newPassword with 129 chars', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'some-token',
        newPassword: 'a'.repeat(129),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'newPassword');
      expect(pwError).toBeDefined();
    });

    it('should accept newPassword with 8 chars', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'some-token',
        newPassword: 'a'.repeat(8),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'newPassword');
      expect(pwError).toBeUndefined();
    });
  });

  describe('LoginDto - min 8 and length cap', () => {
    it('should reject password with 7 chars', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: 'a'.repeat(7),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeDefined();
    });

    it('should reject password with 129 chars (CPU DoS prevention for Argon2id)', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: 'a'.repeat(129),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeDefined();
    });

    it('should accept password with 8 chars', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: 'a'.repeat(8),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeUndefined();
    });

    it('should accept password with 128 chars', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: 'a'.repeat(128),
      });
      const errors = await validate(dto);
      const pwError = errors.find((e) => e.property === 'password');
      expect(pwError).toBeUndefined();
    });
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetTodayQueryDto } from '../get-today-query.dto';

describe('GetTodayQueryDto', () => {
  describe('locale validation', () => {
    it('accepts locale=en', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { locale: 'en' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts locale=it', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { locale: 'it' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects unsupported locale=fr', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { locale: 'fr' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts missing locale (optional field)', async () => {
      const dto = plainToInstance(GetTodayQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('tz validation (T-145-04 — IANA allowlist)', () => {
    it('accepts tz=America/New_York', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { tz: 'America/New_York' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts tz=Europe/Rome', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { tz: 'Europe/Rome' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts tz=UTC', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { tz: 'UTC' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects bogus tz=Not/A/Zone', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { tz: 'Not/A/Zone' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects SQL-injection-shaped tz value', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { tz: '"; DROP TABLE--' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects empty string tz', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { tz: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('includeGreeting transformation', () => {
    it("coerces 'true' string to boolean true", async () => {
      const dto = plainToInstance(GetTodayQueryDto, { includeGreeting: 'true' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.includeGreeting).toBe(true);
    });

    it("coerces 'false' string to boolean false", async () => {
      const dto = plainToInstance(GetTodayQueryDto, { includeGreeting: 'false' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.includeGreeting).toBe(false);
    });

    it("coerces '1' string to boolean true", async () => {
      const dto = plainToInstance(GetTodayQueryDto, { includeGreeting: '1' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.includeGreeting).toBe(true);
    });

    it('accepts boolean true directly', async () => {
      const dto = plainToInstance(GetTodayQueryDto, { includeGreeting: true });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.includeGreeting).toBe(true);
    });
  });

  describe('combined valid query', () => {
    it('accepts full valid query with all three params', async () => {
      const dto = plainToInstance(GetTodayQueryDto, {
        locale: 'it',
        tz: 'Europe/Rome',
        includeGreeting: 'true',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.includeGreeting).toBe(true);
    });
  });
});

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * IANA timezone allowlist validator (T-145-04 mitigation).
 *
 * Rejects any value that is not present in `Intl.supportedValuesOf('timeZone')`.
 * Falls back to `Intl.DateTimeFormat` probing on runtimes that do not expose
 * `supportedValuesOf` (Node <18.0). The probe throws RangeError on bad zones.
 */
// Common aliases accepted alongside IANA canonical names. `Intl.supportedValuesOf`
// only returns canonical zones (e.g. `Etc/UTC`), but many clients send `UTC` or
// `GMT`. Treat them as valid since `Intl.DateTimeFormat` also accepts them.
const TIMEZONE_ALIASES = new Set(['UTC', 'GMT']);

@ValidatorConstraint({ name: 'isIanaTimezone', async: false })
export class IsIanaTimezone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) return false;
    if (TIMEZONE_ALIASES.has(value)) return true;
    try {
      const supported = (Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      }).supportedValuesOf;
      if (typeof supported === 'function') {
        const list = supported('timeZone');
        if (list.includes(value)) return true;
        // Fall through to the DateTimeFormat probe below — some valid aliases
        // (e.g. `Etc/UTC`) pass the probe but are absent from the canonical list
        // on older engines.
      }
      // Probe: throws RangeError on bad zones on every supported Node.
      // eslint-disable-next-line no-new
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'tz must be a valid IANA timezone identifier';
  }
}

export class GetTodayQueryDto {
  @ApiPropertyOptional({ enum: ['en', 'it'] })
  @IsOptional()
  @IsString()
  @IsIn(['en', 'it'])
  locale?: string;

  @ApiPropertyOptional({ description: 'IANA timezone, e.g. America/New_York' })
  @IsOptional()
  @IsString()
  @Validate(IsIanaTimezone)
  tz?: string;

  @ApiPropertyOptional({ description: 'Include greeting from BriefingService (cached)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeGreeting?: boolean;
}

import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating a single consent feature
 */
export class UpdateConsentDto {
  @ApiProperty({ description: 'Consent feature ID', example: 'ai_smart_replies' })
  @IsString()
  feature!: string;

  @ApiProperty({ description: 'Whether consent is granted', example: true })
  @IsBoolean()
  granted!: boolean;
}

/**
 * DTO representing current consent state for a feature
 */
export class ConsentStateDto {
  @ApiProperty()
  feature!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  granted!: boolean;

  @ApiProperty({ type: String, nullable: true })
  lastUpdated!: Date | null;

  @ApiProperty({ type: Number, nullable: true })
  version!: number | null;

  @ApiProperty()
  required!: boolean;
}

/**
 * DTO for consent change history records
 */
export class ConsentHistoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  feature!: string;

  @ApiProperty()
  granted!: boolean;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  ipAddress?: string | null;
}

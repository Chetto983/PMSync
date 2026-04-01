import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetCrmContextByEmailQueryDto {
  @ApiProperty({
    description: 'Contact email to resolve into CRM context',
    example: 'customer@example.com',
  })
  @IsEmail()
  email!: string;
}

export class GetActivityTimelineQueryDto {
  @ApiPropertyOptional({ description: 'Cursor for pagination (activity ID)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Number of activities to return', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class GetActivityTimelineParamsDto {
  @ApiProperty({ description: 'Entity type', enum: ['account', 'deal'] })
  @IsEnum(['account', 'deal'])
  entityType!: 'account' | 'deal';

  @ApiProperty({ description: 'Entity ID' })
  @IsString()
  entityId!: string;
}

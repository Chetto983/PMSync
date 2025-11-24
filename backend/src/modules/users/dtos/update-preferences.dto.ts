import { IsOptional, IsBoolean, IsString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiProperty({
    description: 'Folder order per provider',
    example: { 'provider-id-1': ['folder-1', 'folder-2'], 'provider-id-2': ['folder-3'] },
    required: false,
  })
  @IsOptional()
  @IsObject()
  folderOrders?: Record<string, string[]>;

  @ApiProperty({
    description: 'Whether smart filters section is expanded in sidebar',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  sidebarSmartFiltersExpanded?: boolean;

  @ApiProperty({
    description: 'Whether labels section is expanded in sidebar',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  sidebarLabelsExpanded?: boolean;

  @ApiProperty({
    description: 'UI theme preference',
    example: 'light',
    required: false,
  })
  @IsOptional()
  @IsString()
  theme?: string;

  @ApiProperty({
    description: 'Language preference',
    example: 'en',
    required: false,
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({
    description: 'Email list density',
    example: 'comfortable',
    required: false,
  })
  @IsOptional()
  @IsString()
  emailDensity?: string;
}

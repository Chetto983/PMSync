import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CUSTOM_FIELD_ENTITIES = ['account', 'contact', 'deal'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export class CreateCustomFieldDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITIES })
  @IsEnum(CUSTOM_FIELD_ENTITIES)
  entity: CustomFieldEntity;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ enum: CUSTOM_FIELD_TYPES })
  @IsEnum(CUSTOM_FIELD_TYPES)
  type: CustomFieldType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateCustomFieldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class SetCustomFieldValueDto {
  @ApiProperty({ description: 'Custom field ID' })
  @IsString()
  @IsNotEmpty()
  fieldId: string;

  @ApiProperty({ description: 'Value (type depends on field type)' })
  value: any;
}

export class SetCustomFieldValuesDto {
  @ApiProperty({ type: [SetCustomFieldValueDto] })
  @IsArray()
  values: SetCustomFieldValueDto[];
}

import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ContactImportField, CONTACT_IMPORT_FIELDS } from '../types';

export class ColumnMappingDto {
  @ApiProperty({ description: 'CSV column header name' })
  @IsString()
  @IsNotEmpty()
  source: string;

  @ApiProperty({
    description: 'Contact field to map to',
    enum: CONTACT_IMPORT_FIELDS,
  })
  @IsEnum(CONTACT_IMPORT_FIELDS)
  target: ContactImportField;
}

export class ImportContactsDto {
  @ApiProperty({
    description: 'Column mappings from CSV headers to contact fields',
    type: [ColumnMappingDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnMappingDto)
  mappings: ColumnMappingDto[];
}

export class ParseHeadersDto {
  // No body needed — file comes via multipart
}

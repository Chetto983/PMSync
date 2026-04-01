import {
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  IsIn,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListSuggestionsQueryDto {
  @IsOptional()
  @IsString()
  type?: string; // account, deal, ticket, link

  @IsOptional()
  @IsString()
  status?: string; // pending, accepted, dismissed

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

export class BulkSuggestionDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsIn(['accept', 'dismiss'])
  action: 'accept' | 'dismiss';
}

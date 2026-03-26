import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';

export class CreateSavedViewDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsObject()
  filters!: Record<string, unknown>;
}

export class UpdateSavedViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

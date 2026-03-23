import { IsArray, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsObject()
  color?: {
    backgroundColor: string;
    textColor: string;
  };

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  aiPrompt?: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsObject()
  color?: {
    backgroundColor: string;
    textColor: string;
  } | null;

  @IsOptional()
  @IsString()
  icon?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  aiPrompt?: string | null;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  orderIndex?: number;
}

export class AddEmailsToLabelDto {
  @IsArray()
  @IsString({ each: true })
  emailIds!: string[];
}

export class ReorderLabelsDto {
  @IsArray()
  @IsString({ each: true })
  labelIds!: string[];
}

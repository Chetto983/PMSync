import { IsArray, IsBoolean, IsString, ArrayNotEmpty, ArrayMaxSize } from 'class-validator';

/**
 * Bulk Operations DTOs with Validation
 * FIX (BUG-017): Added ValidationPipe decorators for bulk endpoint inputs
 */

export class BulkEmailIdsDto {
    @IsArray()
    @ArrayNotEmpty({ message: 'emailIds array cannot be empty' })
    @ArrayMaxSize(500, { message: 'Maximum 500 emails per bulk operation' })
    @IsString({ each: true })
    emailIds!: string[];
}

export class BulkDeleteDto extends BulkEmailIdsDto { }

export class BulkUpdateReadDto extends BulkEmailIdsDto {
    @IsBoolean()
    isRead!: boolean;
}

export class BulkUpdateStarDto extends BulkEmailIdsDto {
    @IsBoolean()
    isStarred!: boolean;
}

export class BulkUpdateFlagDto extends BulkEmailIdsDto {
    @IsBoolean()
    isFlagged!: boolean;
}

export class BulkMoveToFolderDto extends BulkEmailIdsDto {
    @IsString()
    folder!: string;
}

export class BulkLabelsDto extends BulkEmailIdsDto {
    @IsArray()
    @ArrayNotEmpty({ message: 'labelIds array cannot be empty' })
    @IsString({ each: true })
    labelIds!: string[];
}

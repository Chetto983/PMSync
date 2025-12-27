import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard pagination query parameters DTO
 *
 * Consolidates duplicate pagination validation logic from:
 * - emails.controller.ts
 * - folders.controller.ts
 * - ai.controller.ts
 *
 * @see EMAIL_MODULE_ROADMAP.md DUP-13
 */
export class PaginationDto {
    @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Page number (1-indexed)' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({
        minimum: 1,
        maximum: 1000,
        default: 50,
        description: 'Items per page',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(1000)
    limit?: number = 50;

    get skip(): number {
        return ((this.page || 1) - 1) * (this.limit || 50);
    }

    get take(): number {
        return this.limit || 50;
    }
}

/**
 * Generic paginated response wrapper
 */
export class PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };

    static create<T>(data: T[], total: number, pagination: PaginationDto): PaginatedResponse<T> {
        const limit = pagination.limit || 50;
        const page = pagination.page || 1;
        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}

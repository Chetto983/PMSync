/**
 * Shared pagination utilities.
 *
 * Consolidates the page/limit validation and skip calculation that was
 * duplicated across EmailCrudService, EmailSearchService, and others.
 */
import { BadRequestException } from '@nestjs/common';

export interface PaginationInput {
  page?: number;
  limit?: number;
  maxLimit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Validate and normalise pagination parameters.
 *
 * @param input  Raw pagination values (all optional, with sane defaults)
 * @returns      Validated page, limit, and computed skip
 * @throws BadRequestException when page < 1 or limit out of bounds
 */
export function validatePagination(input: PaginationInput = {}): PaginationResult {
  const page = input.page ?? 1;
  const maxLimit = input.maxLimit && input.maxLimit > 0 ? input.maxLimit : 100;
  const limit = input.limit ?? 50;

  if (page < 1) {
    throw new BadRequestException('Page must be >= 1');
  }
  if (limit < 1 || limit > maxLimit) {
    throw new BadRequestException(`Limit must be between 1 and ${maxLimit}`);
  }

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Build pagination metadata from a total count.
 */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

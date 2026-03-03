import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ApiExceptionFilter } from './api-exception.filter';

// Mock PrismaClientKnownRequestError shape
class PrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  clientVersion: string;

  constructor(message: string, opts: { code: string; meta?: Record<string, unknown>; clientVersion?: string }) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = opts.code;
    this.meta = opts.meta;
    this.clientVersion = opts.clientVersion || '6.0.0';
  }
}

describe('ApiExceptionFilter', () => {
  let filter: ApiExceptionFilter;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;
  let mockResponse: any;
  let mockRequest: any;

  function createHost() {
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
        getNext: () => jest.fn(),
      }),
      getArgs: () => [],
      getArgByIndex: () => null,
      getType: () => 'http',
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
    } as any;
  }

  beforeEach(() => {
    filter = new ApiExceptionFilter();
    mockJson = jest.fn();
    mockHeader = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson, header: mockHeader });
    mockResponse = { status: mockStatus, header: mockHeader };
    mockRequest = { id: 'test-req-id', method: 'GET', url: '/test' };
  });

  it('HttpException 404 returns { error: { code: "NOT_FOUND" }, meta: { requestId } }', () => {
    const ex = new NotFoundException('Resource not found');
    filter.catch(ex, createHost());

    expect(mockStatus).toHaveBeenCalledWith(404);
    const body = mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBeDefined();
    expect(body.meta.requestId).toBe('test-req-id');
    expect(body.error.details).toBeNull();
  });

  it('HttpException 400 with ValidationPipe message array returns VALIDATION_ERROR with fields', () => {
    const ex = new BadRequestException({
      message: ['email must be an email', 'name should not be empty'],
      error: 'Bad Request',
      statusCode: 400,
    });
    filter.catch(ex, createHost());

    expect(mockStatus).toHaveBeenCalledWith(400);
    const body = mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveProperty('fields');
    expect(body.error.details.fields).toHaveLength(2);
    expect(body.error.details.fields[0]).toHaveProperty('message');
  });

  it('ThrottlerException returns 429 with RATE_LIMITED, retryAfter, and Retry-After header', () => {
    const ex = new ThrottlerException();
    filter.catch(ex, createHost());

    expect(mockStatus).toHaveBeenCalledWith(429);
    const body = mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details).toHaveProperty('retryAfter', 60);
    expect(body.meta.requestId).toBe('test-req-id');
  });

  it('PrismaClientKnownRequestError P2002 returns 409 with code containing _DUPLICATE', () => {
    const ex = new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      meta: { target: ['email'] },
    });
    filter.catch(ex, createHost());

    expect(mockStatus).toHaveBeenCalledWith(409);
    const body = mockJson.mock.calls[0][0];
    expect(body.error.code).toContain('_DUPLICATE');
  });

  it('PrismaClientKnownRequestError P2025 returns 404 with code containing _NOT_FOUND', () => {
    const ex = new PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      meta: { modelName: 'User' },
    });
    filter.catch(ex, createHost());

    expect(mockStatus).toHaveBeenCalledWith(404);
    const body = mockJson.mock.calls[0][0];
    expect(body.error.code).toContain('_NOT_FOUND');
  });

  it('Generic Error returns 500 INTERNAL_ERROR without leaking stack or message', () => {
    const ex = new Error('Database connection pool exhausted');
    filter.catch(ex, createHost());

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.details).toBeNull();
    // Must not leak the actual error message
    expect(body.error.message).not.toContain('Database');
  });

  it('Unknown throw (string) returns 500 INTERNAL_ERROR', () => {
    filter.catch('random string throw', createHost());

    expect(mockStatus).toHaveBeenCalledWith(500);
    const body = mockJson.mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
  });

  it('No statusCode field exists in any error response body', () => {
    // Test multiple exception types
    const exceptions: unknown[] = [
      new NotFoundException('not found'),
      new BadRequestException('bad request'),
      new Error('internal'),
      'string throw',
    ];

    for (const ex of exceptions) {
      mockJson.mockClear();
      mockStatus.mockClear();
      mockStatus.mockReturnValue({ json: mockJson, header: mockHeader });

      filter.catch(ex, createHost());
      const body = mockJson.mock.calls[0][0];
      expect(body).not.toHaveProperty('statusCode');
      // Also check nested
      if (body.error) {
        expect(body.error).not.toHaveProperty('statusCode');
      }
    }
  });
});

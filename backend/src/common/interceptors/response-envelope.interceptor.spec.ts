import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, lastValueFrom } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';

describe('ResponseEnvelopeInterceptor', () => {
  let interceptor: ResponseEnvelopeInterceptor;
  let reflector: Reflector;

  const mockRequest = { id: 'req-abc-123' };

  function createContext(handler = jest.fn(), classRef = class {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({}),
        getNext: () => jest.fn(),
      }),
      getHandler: () => handler,
      getClass: () => classRef,
      getType: () => 'http',
      getArgs: () => [],
      getArgByIndex: () => null,
      switchToRpc: jest.fn() as any,
      switchToWs: jest.fn() as any,
    } as unknown as ExecutionContext;
  }

  function createCallHandler(data: unknown): CallHandler {
    return { handle: () => of(data) };
  }

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new ResponseEnvelopeInterceptor(reflector);
  });

  it('wraps plain object response in { data, meta }', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createContext();
    const result = await lastValueFrom(
      interceptor.intercept(ctx, createCallHandler({ foo: 'bar' })),
    );

    expect(result).toHaveProperty('data', { foo: 'bar' });
    expect(result).toHaveProperty('meta');
    expect(result.meta).toHaveProperty('requestId', 'req-abc-123');
    expect(result.meta).toHaveProperty('timestamp');
    expect(typeof result.meta.timestamp).toBe('string');
  });

  it('wraps array response in { data, meta }', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createContext();
    const result = await lastValueFrom(
      interceptor.intercept(ctx, createCallHandler([1, 2, 3])),
    );

    expect(result).toHaveProperty('data', [1, 2, 3]);
    expect(result.meta.requestId).toBe('req-abc-123');
  });

  it('wraps null response in { data: null, meta }', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createContext();
    const result = await lastValueFrom(
      interceptor.intercept(ctx, createCallHandler(null)),
    );

    expect(result).toHaveProperty('data', null);
    expect(result.meta.requestId).toBe('req-abc-123');
  });

  it('skips wrapping when @SkipEnvelope is on the handler', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === SKIP_ENVELOPE_KEY) return true;
      return undefined;
    });
    const ctx = createContext();
    const raw = { raw: true };
    const result = await lastValueFrom(
      interceptor.intercept(ctx, createCallHandler(raw)),
    );

    expect(result).toEqual({ raw: true });
    expect(result).not.toHaveProperty('meta');
  });

  it('skips wrapping when @SkipEnvelope is on the controller class', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === SKIP_ENVELOPE_KEY) return true;
      return undefined;
    });
    const ctx = createContext();
    const raw = { streaming: true };
    const result = await lastValueFrom(
      interceptor.intercept(ctx, createCallHandler(raw)),
    );

    expect(result).toEqual({ streaming: true });
  });

  it('meta.requestId matches req.id from RequestIdMiddleware', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const customReq = { id: 'custom-nanoid-xyz' };
    const ctx = {
      ...createContext(),
      switchToHttp: () => ({
        getRequest: () => customReq,
        getResponse: () => ({}),
        getNext: () => jest.fn(),
      }),
    } as unknown as ExecutionContext;

    const result = await lastValueFrom(
      interceptor.intercept(ctx, createCallHandler({ x: 1 })),
    );

    expect(result.meta.requestId).toBe('custom-nanoid-xyz');
  });
});

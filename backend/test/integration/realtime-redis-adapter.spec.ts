/**
 * Cross-instance WebSocket integration test (TEST-10).
 *
 * Validates INFRA-01/02/03: two Socket.IO servers sharing a Redis adapter
 * can deliver messages cross-instance and maintain tenant room isolation.
 *
 * Skips gracefully when Redis is unavailable (CI without Redis).
 */
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { AddressInfo } from 'net';

let pubA: Redis;
let subA: Redis;
let pubB: Redis;
let subB: Redis;
let httpA: HttpServer;
let httpB: HttpServer;
let serverA: SocketIOServer;
let serverB: SocketIOServer;
let portA: number;
let portB: number;
let redisAvailable = false;

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

jest.setTimeout(15_000);

beforeAll(async () => {
  // Probe Redis connectivity
  const probe = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null, // no retries
  });
  try {
    await probe.connect();
    await probe.ping();
    redisAvailable = true;
  } catch {
    redisAvailable = false;
  } finally {
    try { await probe.quit(); } catch { /* ignore */ }
  }

  if (!redisAvailable) return;

  // Create pub/sub pairs for two independent servers
  pubA = new Redis({ host: REDIS_HOST, port: REDIS_PORT, connectionName: 'test-pubA' });
  subA = pubA.duplicate({ connectionName: 'test-subA' });
  pubB = new Redis({ host: REDIS_HOST, port: REDIS_PORT, connectionName: 'test-pubB' });
  subB = pubB.duplicate({ connectionName: 'test-subB' });

  // Server A
  httpA = createServer();
  serverA = new SocketIOServer(httpA, {
    transports: ['websocket'],
    adapter: createAdapter(pubA, subA),
  });
  serverA.on('connection', (socket) => {
    socket.on('join', (room: string) => {
      void socket.join(room);
      socket.emit('joined', room);
    });
  });
  await new Promise<void>((resolve) => httpA.listen(0, resolve));
  portA = (httpA.address() as AddressInfo).port;

  // Server B
  httpB = createServer();
  serverB = new SocketIOServer(httpB, {
    transports: ['websocket'],
    adapter: createAdapter(pubB, subB),
  });
  serverB.on('connection', (socket) => {
    socket.on('join', (room: string) => {
      void socket.join(room);
      socket.emit('joined', room);
    });
  });
  await new Promise<void>((resolve) => httpB.listen(0, resolve));
  portB = (httpB.address() as AddressInfo).port;
});

afterAll(async () => {
  if (!redisAvailable) return;

  await serverA?.close();
  await serverB?.close();
  httpA?.close();
  httpB?.close();
  await Promise.allSettled([
    pubA?.quit(),
    subA?.quit(),
    pubB?.quit(),
    subB?.quit(),
  ]);
});

function connectClient(port: number): ClientSocket {
  return ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
  });
}

function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeout = 3000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for '${event}'`)),
      timeout,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('Redis IO Adapter - Cross-instance delivery', () => {
  it('message emitted on server A is received by client connected to server B', async () => {
    if (!redisAvailable) {
      console.log('SKIP: Redis not available');
      return;
    }

    const clientB = connectClient(portB);
    await waitForEvent(clientB, 'connect');

    // Client joins a room via server B
    clientB.emit('join', 'cross-test-room');
    await waitForEvent(clientB, 'joined');

    // Listen for the event on client B
    const received = waitForEvent<{ msg: string }>(clientB, 'test-event');

    // Server A emits to the room -- Redis adapter should relay to server B
    serverA.to('cross-test-room').emit('test-event', { msg: 'hello-from-A' });

    const data = await received;
    expect(data).toEqual({ msg: 'hello-from-A' });

    clientB.disconnect();
  });

  it('tenant-scoped room isolation', async () => {
    if (!redisAvailable) {
      console.log('SKIP: Redis not available');
      return;
    }

    const clientT1 = connectClient(portA);
    const clientT2 = connectClient(portB);

    await Promise.all([
      waitForEvent(clientT1, 'connect'),
      waitForEvent(clientT2, 'connect'),
    ]);

    // Each client joins a different tenant room
    clientT1.emit('join', 'tenant:t1:updates');
    clientT2.emit('join', 'tenant:t2:updates');

    await Promise.all([
      waitForEvent(clientT1, 'joined'),
      waitForEvent(clientT2, 'joined'),
    ]);

    // Track what client T2 receives
    let t2Received = false;
    clientT2.on('tenant-event', () => {
      t2Received = true;
    });

    // Listen on T1 for the event
    const t1Promise = waitForEvent<{ v: number }>(clientT1, 'tenant-event');

    // Emit only to tenant:t1:updates room
    serverB.to('tenant:t1:updates').emit('tenant-event', { v: 42 });

    const t1Data = await t1Promise;
    expect(t1Data).toEqual({ v: 42 });

    // Give T2 a moment to potentially receive (it should NOT)
    await new Promise((r) => setTimeout(r, 500));
    expect(t2Received).toBe(false);

    clientT1.disconnect();
    clientT2.disconnect();
  });
});

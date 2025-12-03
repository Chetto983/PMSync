/**
 * WebSocket Connection Test
 * Tests the realtime WebSocket connection with authentication
 */
import { io, Socket } from 'socket.io-client';

const API_URL = 'http://localhost:3000';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJsMVhCQTV3eTk0cXRDa0o4V3VrQW0iLCJ1c2VySWQiOiJjbWlxNmNvMnEwMDAxMHN5aDJpNTJlM3N0IiwidGVuYW50SWQiOiJjbWlxNmNvMHkwMDAwMHN5aHVpbWtrdWh1IiwiZW1haWwiOiJkdmRtYXJjaGV0dG9AZ21haWwuY29tIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzY0Nzc2NTM2LCJleHAiOjE3NjQ3Nzc0MzYsImF1ZCI6Im1haWxhZ2VudC1hcGkiLCJpc3MiOiJtYWlsYWdlbnQtYXV0aCJ9.AS05zfTMo0SIlH5JbA1ao00RxjtSDA1OqS4Tp8W1HMM';

async function testWebSocket(): Promise<void> {
  console.log('='.repeat(60));
  console.log('WebSocket Connection Test');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log('');

  return new Promise((resolve) => {
    console.log('[INFO] Connecting to WebSocket...');

    // Connect to namespace '/realtime' - not a path, it's a Socket.IO namespace
    const socket: Socket = io(`${API_URL}/realtime`, {
      transports: ['websocket', 'polling'],
      auth: {
        token: TOKEN,
      },
      // Also try query param and header
      query: { token: TOKEN },
      extraHeaders: {
        Authorization: `Bearer ${TOKEN}`,
      },
    });

    const timeout = setTimeout(() => {
      console.log('[FAIL] Connection timeout after 10 seconds');
      socket.disconnect();
      resolve();
    }, 10000);

    socket.on('connect', () => {
      console.log('[PASS] Connected to WebSocket!');
      console.log(`       Socket ID: ${socket.id}`);

      // Test ping/pong
      console.log('[INFO] Sending ping...');
      socket.emit('ping');
    });

    socket.on('pong', (data) => {
      console.log('[PASS] Received pong:', data);

      // Test join_room
      console.log('[INFO] Joining room "test-room"...');
      socket.emit('join_room', { room: 'test-room' });
    });

    socket.on('room_joined', (data) => {
      console.log('[PASS] Room joined:', data);

      // Test leave_room
      console.log('[INFO] Leaving room "test-room"...');
      socket.emit('leave_room', { room: 'test-room' });
    });

    socket.on('room_left', (data) => {
      console.log('[PASS] Room left:', data);

      clearTimeout(timeout);
      console.log('');
      console.log('='.repeat(60));
      console.log('All WebSocket tests passed!');
      console.log('='.repeat(60));
      socket.disconnect();
      resolve();
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      console.log('[FAIL] Connection error:', error.message);
      socket.disconnect();
      resolve();
    });

    socket.on('disconnect', (reason) => {
      console.log('[INFO] Disconnected:', reason);
    });

    socket.on('error', (error) => {
      console.log('[FAIL] Socket error:', error);
    });
  });
}

testWebSocket().then(() => {
  console.log('');
  console.log('Test completed.');
  process.exit(0);
});

/**
 * IRealtimeGateway - Interface for the WebSocket gateway.
 * Extracted to break circular dependency between realtime-events.service.ts and realtime.gateway.ts.
 */
import type { Server } from 'socket.io';

export interface IRealtimeGateway {
  server: Server;
  hasTenantConnections(tenantId: string): boolean;
}

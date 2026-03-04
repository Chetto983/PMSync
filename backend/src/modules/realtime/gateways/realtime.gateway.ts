import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RealtimeEventsService } from '../services/realtime-events.service';
import { RealtimeHandshakeService } from '../services/realtime-handshake.service';
import {
  AuthenticatedSocket,
  buildTenantScopedRoom,
} from '../types/realtime.types';

// Room name validation constants
const ROOM_NAME_MAX_LENGTH = 100;
const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_\-:.]+$/;

/**
 * Validates room name to prevent room explosion and malformed names
 * @param room Room name to validate
 * @returns Error message if invalid, null if valid
 */
function validateRoomName(room: unknown): string | null {
  if (typeof room !== 'string') {
    return 'room must be a string';
  }
  if (!room || room.trim().length === 0) {
    return 'room name cannot be empty';
  }
  if (room.length > ROOM_NAME_MAX_LENGTH) {
    return `room name exceeds maximum length of ${ROOM_NAME_MAX_LENGTH}`;
  }
  if (!ROOM_NAME_PATTERN.test(room)) {
    return 'room name contains invalid characters (allowed: alphanumeric, underscore, hyphen, colon, dot)';
  }
  return null;
}

/**
 * WebSocket Gateway per comunicazione realtime multi-tenant
 *
 * Caratteristiche:
 * - Autenticazione JWT su handshake
 * - Isolamento tenant tramite rooms (tenant:${tenantId})
 * - CORS configurabile
 * - Heartbeat automatico
 * - Supporto eventi bidirezionali
 *
 * Note: process.env è usato nel decorator perché i decoratori sono valutati
 * staticamente prima dell'iniezione di dipendenze. Questo è un pattern
 * accettabile in NestJS per configurazioni gateway.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:3001'],
    credentials: true,
  },
  namespace: '/realtime',
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /**
   * Traccia esplicito dei tenant con connessioni attive
   * Map: tenantId -> numero di connessioni
   * Più affidabile del controllo delle rooms
   */
  private activeTenantConnections = new Map<string, number>();

  constructor(
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly handshakeService: RealtimeHandshakeService,
  ) {}

  onModuleInit() {
    // Injetta il gateway nel service per evitare circular dependency
    this.realtimeEvents.setGateway(this);
  }

  afterInit(_server: Server) {
    this.logger.log('WebSocket Gateway initialized');
    // Socket.IO built-in pingInterval/pingTimeout (default 25s/20s) keeps connections alive.
    // No custom heartbeat needed.
  }

  /**
   * Gestisce nuove connessioni WebSocket
   * Valida JWT e aggiunge il socket alla room del tenant
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      const authContext = await this.handshakeService.authenticate(client);

      client.userId = authContext.userId;
      client.tenantId = authContext.tenantId;
      client.email = authContext.email;

      await client.join(authContext.tenantRoom);

      // Traccia il tenant come attivo - incrementa il counter
      const currentCount = this.activeTenantConnections.get(client.tenantId) || 0;
      this.activeTenantConnections.set(client.tenantId, currentCount + 1);

      this.logger.log(`[WS] Client connected: ${client.id} | User: ${client.email} | Tenant: ${client.tenantId} | Room: ${authContext.tenantRoom} | Connections: ${this.activeTenantConnections.get(client.tenantId)}`);

      // Notifica il client della connessione riuscita
      client.emit('connected', {
        userId: client.userId,
        tenantId: client.tenantId,
        email: client.email,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`[WS] Connection error: ${message}`, stack);
      client.disconnect();
    }
  }

  /**
   * Gestisce disconnessioni
   */
  handleDisconnect(client: AuthenticatedSocket) {
    // Decrementa il counter delle connessioni per questo tenant
    if (client.tenantId) {
      const currentCount = this.activeTenantConnections.get(client.tenantId) || 0;
      if (currentCount <= 1) {
        // Ultima connessione, rimuovi il tenant
        this.activeTenantConnections.delete(client.tenantId);
        this.logger.log(
          `[WS] Client disconnected: ${client.id} | User: ${client.email || 'unknown'} | Tenant: ${client.tenantId} | Last connection - tenant removed`,
        );
      } else {
        // Ancora altre connessioni, decrementa
        this.activeTenantConnections.set(client.tenantId, currentCount - 1);
        this.logger.log(
          `[WS] Client disconnected: ${client.id} | User: ${client.email || 'unknown'} | Tenant: ${client.tenantId} | Remaining connections: ${currentCount - 1}`,
        );
      }
    } else {
      this.logger.log(
        `[WS] Client disconnected: ${client.id} | User: ${client.email || 'unknown'} | No tenant ID`,
      );
    }
  }

  /**
   * Permette ai client di fare ping per verificare la connessione
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() _client: AuthenticatedSocket) {
    return {
      event: 'pong',
      data: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * Permette ai client di unirsi a stanze aggiuntive (es. email threads)
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.tenantId) {
      this.logger.warn(`join_room rejected for unauthenticated client ${client.id}`);
      return { event: 'error', data: { message: 'unauthenticated' } };
    }

    // Validate room name to prevent room explosion and malformed names
    const validationError = validateRoomName(data?.room);
    if (validationError) {
      this.logger.warn(
        `join_room rejected for client ${client.id}: ${validationError}`,
      );
      return { event: 'error', data: { message: validationError } };
    }

    // Assicurati che la room inizi con il tenantId per sicurezza
    const room = buildTenantScopedRoom(client.tenantId, data.room);
    await client.join(room);
    this.logger.debug(`Client ${client.id} joined room: ${room}`);
    return { event: 'joined_room', data: { room } };
  }

  /**
   * Permette ai client di lasciare stanze
   */
  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.tenantId) {
      this.logger.warn(`leave_room rejected for unauthenticated client ${client.id}`);
      return { event: 'error', data: { message: 'unauthenticated' } };
    }

    // Validate room name to prevent malformed names
    const validationError = validateRoomName(data?.room);
    if (validationError) {
      this.logger.warn(
        `leave_room rejected for client ${client.id}: ${validationError}`,
      );
      return { event: 'error', data: { message: validationError } };
    }

    const room = buildTenantScopedRoom(client.tenantId, data.room);
    await client.leave(room);
    this.logger.debug(`Client ${client.id} left room: ${room}`);
    return { event: 'left_room', data: { room } };
  }

  /**
   * Verifica se un tenant ha connessioni WebSocket attive
   * Usa il tracking esplicito invece del controllo delle rooms (più affidabile)
   * @param tenantId ID del tenant
   * @returns true se ci sono client connessi per questo tenant
   */
  hasTenantConnections(tenantId: string): boolean {
    const count = this.activeTenantConnections.get(tenantId) || 0;
    const hasConnections = count > 0;

    this.logger.debug(
      `[hasTenantConnections] Tenant ${tenantId}: ${count} connection(s) - ${hasConnections ? 'ACTIVE' : 'INACTIVE'}`,
    );

    return hasConnections;
  }

  /**
   * Cleanup quando il gateway viene distrutto
   */
  onModuleDestroy() {
    // No resources to clean up; Socket.IO handles its own lifecycle.
  }
}

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

/**
 * NodePress Real-time Gateway
 *
 * Clients connect at ws://host/api/realtime
 * Events sent TO clients:
 *   entry:created  { id, slug, contentType, locale }
 *   entry:updated  { id, slug, contentType, locale, status }
 *   entry:deleted  { id, slug }
 *   entry:restored { id, slug }
 *   media:uploaded { id, filename, url }
 *   media:deleted  { filename }
 *
 * Clients can subscribe to specific content type rooms:
 *   subscribe { contentType: 'article' }  → joins room "ct:article"
 *   unsubscribe { contentType: 'article' }
 *
 * Multi-instance scaling:
 *   When REDIS_URL is set, the @socket.io/redis-adapter is attached automatically.
 *   This syncs Socket.io rooms and events across all backend instances so a
 *   broadcast from instance A reaches clients connected to instance B.
 *   Falls back to in-memory adapter if Redis is unavailable (single-instance mode).
 */
@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  path: '/api/realtime',
  cors: {
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  async afterInit(server: Server) {
    if (process.env.REDIS_URL) {
      try {
        const { createAdapter } = await import('@socket.io/redis-adapter');
        const { Redis }         = await import('ioredis');
        const pubClient = new Redis(process.env.REDIS_URL);
        const subClient = pubClient.duplicate();

        pubClient.on('error', (err) =>
          this.logger.warn(`Socket.io Redis pub error: ${err.message}`),
        );
        subClient.on('error', (err) =>
          this.logger.warn(`Socket.io Redis sub error: ${err.message}`),
        );

        server.adapter(createAdapter(pubClient, subClient));
        this.logger.log('Socket.io: Redis adapter enabled — events sync across all instances');
      } catch (err: any) {
        // Fail-open: app still works with in-memory adapter on a single instance
        this.logger.warn(
          `Socket.io: Redis adapter init failed (${err.message}) — falling back to in-memory adapter`,
        );
      }
    } else {
      this.logger.log('Socket.io: using in-memory adapter (set REDIS_URL to enable multi-instance sync)');
    }
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
    client.join('global');
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { contentType: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.contentType) {
      client.join(`ct:${data.contentType}`);
      return { subscribed: data.contentType };
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { contentType: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.contentType) {
      client.leave(`ct:${data.contentType}`);
      return { unsubscribed: data.contentType };
    }
  }

  // ─── Methods called by services to broadcast events ───────────────────────

  notifyEntryCreated(payload: { id: number; slug: string; contentType: string; locale?: string }) {
    this.server.to('global').emit('entry:created', payload);
    this.server.to(`ct:${payload.contentType}`).emit('entry:created', payload);
  }

  notifyEntryUpdated(payload: { id: number; slug: string; contentType: string; locale?: string; status?: string }) {
    this.server.to('global').emit('entry:updated', payload);
    this.server.to(`ct:${payload.contentType}`).emit('entry:updated', payload);
  }

  notifyEntryDeleted(payload: { id: number; slug: string; contentType?: string }) {
    this.server.to('global').emit('entry:deleted', payload);
    if (payload.contentType) {
      this.server.to(`ct:${payload.contentType}`).emit('entry:deleted', payload);
    }
  }

  notifyMediaUploaded(payload: { id: number; filename: string; url: string; mimetype: string }) {
    this.server.to('global').emit('media:uploaded', payload);
  }

  notifyMediaDeleted(payload: { filename: string }) {
    this.server.to('global').emit('media:deleted', payload);
  }
}

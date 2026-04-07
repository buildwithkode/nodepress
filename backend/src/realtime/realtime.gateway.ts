import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
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
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

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

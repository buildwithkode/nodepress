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
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

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
interface UserPresence {
  id: number;
  email: string;
  role: string;
  socketId: string;
  joinedAt: number;
}

interface EntryLock {
  userId: number;
  email: string;
  role: string;
  lockedAt: number;
  expiresAt: number;
}

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

  // Map of entryId -> Map of socketId -> UserPresence
  private readonly entryPresences = new Map<number, Map<string, UserPresence>>();
  // Map of entryId -> EntryLock
  private readonly entryLocks = new Map<number, EntryLock>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Extracts and verifies JWT or API key from the socket handshake.
  // Returns the authenticated user/key payload, or null if invalid.
  private async authenticate(client: Socket): Promise<{ id: number; email: string; role: string } | null> {
    try {
      // 1 — Bearer token in Authorization header (browser WebSocket via auth option)
      const authHeader = client.handshake.headers?.authorization as string | undefined;
      const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      // 2 — Token passed as socket auth object: io(url, { auth: { token: 'Bearer ...' } })
      const tokenFromAuth = (client.handshake.auth?.token as string | undefined)
        ?.replace(/^Bearer\s+/i, '') ?? null;

      // 3 — API key: X-API-Key header or auth.apiKey
      const apiKey =
        (client.handshake.headers?.['x-api-key'] as string | undefined) ??
        (client.handshake.auth?.apiKey as string | undefined) ?? null;

      const token = tokenFromHeader ?? tokenFromAuth;

      if (token) {
        const payload = this.jwtService.verify<{ sub: number; email: string }>(token, {
          secret: process.env.JWT_SECRET,
        });
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user) return null;
        return { id: user.id, email: user.email, role: user.role };
      }

      if (apiKey) {
        const key = await this.prisma.apiKey.findUnique({ where: { key: apiKey } });
        if (!key) return null;
        // API keys get a synthetic user object — no role restrictions on read-only events
        return { id: 0, email: `apikey:${key.name}`, role: 'viewer' };
      }

      return null;
    } catch {
      return null;
    }
  }

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

  async handleConnection(client: Socket) {
    const user = await this.authenticate(client);
    if (!user) {
      client.emit('error', { message: 'Unauthorized — provide a valid JWT or API key' });
      client.disconnect(true);
      this.logger.debug(`Rejected unauthenticated connection: ${client.id}`);
      return;
    }
    (client as any).user = user;
    client.join('global');
    this.logger.debug(`Client connected: ${client.id} (${user.email})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
    const user = (client as any).user;
    if (!user) return;

    // Sweep all entry rooms client was part of
    for (const [entryId, presences] of this.entryPresences.entries()) {
      if (presences.has(client.id)) {
        presences.delete(client.id);
        if (presences.size === 0) {
          this.entryPresences.delete(entryId);
        }
        this.server.to(`entry:${entryId}`).emit('entry:presence', {
          entryId,
          users: this.getPresenceList(entryId),
        });
      }

      // If user had a lock and has no more active sockets for this entry, release lock
      const lock = this.entryLocks.get(entryId);
      if (lock && lock.userId === user.id) {
        const stillPresent = this.entryPresences.get(entryId)?.values();
        const userStillHere = stillPresent ? Array.from(stillPresent).some((p) => p.id === user.id) : false;
        if (!userStillHere) {
          this.entryLocks.delete(entryId);
          this.server.to(`entry:${entryId}`).emit('entry:lockReleased', { entryId, userId: user.id });
        }
      }
    }
  }

  getLockStatus(entryId: number): EntryLock | null {
    const lock = this.entryLocks.get(entryId);
    if (!lock) return null;
    if (lock.expiresAt < Date.now()) {
      this.entryLocks.delete(entryId);
      return null;
    }
    return lock;
  }

  getPresenceList(entryId: number): { id: number; email: string; role: string; joinedAt: number }[] {
    const presences = this.entryPresences.get(entryId);
    if (!presences) return [];
    // Dedup by userId
    const byUser = new Map<number, { id: number; email: string; role: string; joinedAt: number }>();
    for (const p of presences.values()) {
      byUser.set(p.id, { id: p.id, email: p.email, role: p.role, joinedAt: p.joinedAt });
    }
    return Array.from(byUser.values());
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

  // ── Entry Collaborative Presence & Soft-Locking Handlers ─────────────────

  @SubscribeMessage('entry:join')
  handleEntryJoin(
    @MessageBody() data: { entryId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    const entryId = Number(data?.entryId);
    if (!user || !entryId) return;

    client.join(`entry:${entryId}`);

    let presences = this.entryPresences.get(entryId);
    if (!presences) {
      presences = new Map();
      this.entryPresences.set(entryId, presences);
    }
    presences.set(client.id, {
      id: user.id,
      email: user.email,
      role: user.role,
      socketId: client.id,
      joinedAt: Date.now(),
    });

    const activeUsers = this.getPresenceList(entryId);
    const lock = this.getLockStatus(entryId);

    this.server.to(`entry:${entryId}`).emit('entry:presence', {
      entryId,
      users: activeUsers,
    });

    return { success: true, entryId, users: activeUsers, lock };
  }

  @SubscribeMessage('entry:leave')
  handleEntryLeave(
    @MessageBody() data: { entryId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    const entryId = Number(data?.entryId);
    if (!user || !entryId) return;

    client.leave(`entry:${entryId}`);
    const presences = this.entryPresences.get(entryId);
    if (presences) {
      presences.delete(client.id);
      if (presences.size === 0) this.entryPresences.delete(entryId);
    }

    const lock = this.entryLocks.get(entryId);
    if (lock && lock.userId === user.id) {
      this.entryLocks.delete(entryId);
      this.server.to(`entry:${entryId}`).emit('entry:lockReleased', { entryId, userId: user.id });
    }

    this.server.to(`entry:${entryId}`).emit('entry:presence', {
      entryId,
      users: this.getPresenceList(entryId),
    });

    return { success: true, entryId };
  }

  @SubscribeMessage('entry:requestLock')
  handleRequestLock(
    @MessageBody() data: { entryId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    const entryId = Number(data?.entryId);
    if (!user || !entryId) return { acquired: false, message: 'Invalid request' };

    const currentLock = this.getLockStatus(entryId);
    if (!currentLock || currentLock.userId === user.id) {
      const lock: EntryLock = {
        userId: user.id,
        email: user.email,
        role: user.role,
        lockedAt: Date.now(),
        expiresAt: Date.now() + 60000, // 60s lease
      };
      this.entryLocks.set(entryId, lock);
      this.server.to(`entry:${entryId}`).emit('entry:lockAcquired', { entryId, lock });
      return { acquired: true, lock };
    }

    return { acquired: false, lock: currentLock };
  }

  @SubscribeMessage('entry:heartbeat')
  handleHeartbeat(
    @MessageBody() data: { entryId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    const entryId = Number(data?.entryId);
    if (!user || !entryId) return;

    const lock = this.entryLocks.get(entryId);
    if (lock && lock.userId === user.id) {
      lock.expiresAt = Date.now() + 60000;
      return { renewed: true, expiresAt: lock.expiresAt };
    }
    return { renewed: false };
  }

  @SubscribeMessage('entry:releaseLock')
  handleReleaseLock(
    @MessageBody() data: { entryId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    const entryId = Number(data?.entryId);
    if (!user || !entryId) return;

    const lock = this.entryLocks.get(entryId);
    if (lock && (lock.userId === user.id || user.role === 'admin')) {
      this.entryLocks.delete(entryId);
      this.server.to(`entry:${entryId}`).emit('entry:lockReleased', { entryId, userId: user.id });
      return { released: true };
    }
    return { released: false };
  }

  @SubscribeMessage('entry:takeoverLock')
  handleTakeoverLock(
    @MessageBody() data: { entryId: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = (client as any).user;
    const entryId = Number(data?.entryId);
    if (!user || !entryId) return { acquired: false };

    // Admin or editor can take over lock
    if (user.role !== 'admin' && user.role !== 'editor') {
      return { acquired: false, message: 'Insufficient permissions for takeover' };
    }

    const previousLock = this.entryLocks.get(entryId);
    const newLock: EntryLock = {
      userId: user.id,
      email: user.email,
      role: user.role,
      lockedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    };
    this.entryLocks.set(entryId, newLock);

    this.server.to(`entry:${entryId}`).emit('entry:lockTakeover', {
      entryId,
      previousLock,
      newLock,
    });

    return { acquired: true, lock: newLock };
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

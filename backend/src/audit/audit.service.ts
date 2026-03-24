import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditActor {
  id?: number;
  email: string;
  ip?: string;
}

export type AuditAction = 'created' | 'updated' | 'deleted' | 'restored' | 'login' | 'role_changed' | 'password_changed';
export type AuditResource = 'entry' | 'content_type' | 'user' | 'api_key' | 'form' | 'media';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Record an audit event. Non-blocking — errors are caught and logged but
   * never propagate to the caller to avoid breaking the primary operation.
   */
  async log(
    actor: AuditActor,
    action: AuditAction,
    resource: AuditResource,
    resourceId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await (this.prisma as any).auditLog.create({
        data: {
          userId: actor.id ?? null,
          userEmail: actor.email,
          action,
          resource,
          resourceId,
          metadata: metadata ?? null,
          ip: actor.ip ?? null,
        },
      });
    } catch (err) {
      // Audit failure must never break the primary operation
      this.logger.error(`Failed to write audit log: ${err}`);
    }
  }
}

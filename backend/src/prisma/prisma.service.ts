import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** One model operation, as Prisma 5's `$use` middleware saw it. */
export interface OperationParams {
  model?: string;
  action: string;
  args: any;
}

/** Wraps a model operation; must call `next(params)` and return its result. */
export type OperationHook = (params: OperationParams, next: (params: OperationParams) => Promise<any>) => Promise<any>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly hooks: OperationHook[] = [];

  constructor() {
    super();
    // Prisma 6 removed `$use`. A query extension sees the same operations
    // (interactive transactions included), but `$extends` returns a new client,
    // so the constructor returns that client and Nest injects it everywhere.
    // Its prototype chain still leads to this instance, so the fields and
    // methods below keep working (only `instanceof PrismaService` is false).
    const hooks = this.hooks;
    return this.$extends({
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (!hooks.length) return query(args);
            const run = (i: number, params: OperationParams): Promise<any> =>
              i < hooks.length ? hooks[i](params, (next) => run(i + 1, next)) : query(params.args);
            return run(0, { model, action: operation, args });
          },
        },
      },
    }) as this;
  }

  /**
   * Runs `hook` around every model operation of this client, from any service.
   * Hooks run in the order they were added.
   */
  onOperation(hook: OperationHook) {
    this.hooks.push(hook);
  }

  /**
   * Optional read replica (DATABASE_REPLICA_URL). Only queries that tolerate a
   * little replication lag should use it — see `reader`.
   */
  private readonly replica: PrismaClient | null = process.env.DATABASE_REPLICA_URL
    ? new PrismaClient({ datasources: { db: { url: process.env.DATABASE_REPLICA_URL } } })
    : null;

  /**
   * The read replica client, or null when DATABASE_REPLICA_URL is unset.
   * (It returns null rather than `this` as a fallback: Prisma clients are
   * proxies, and `this` inside a getter is the raw target without the model
   * accessors — callers fall back to the injected PrismaService instead.)
   */
  get readReplica(): PrismaClient | null {
    return this.replica;
  }

  async onModuleInit() {
    await this.$connect();
    await this.assertSchemaReady();
    if (this.replica) {
      await this.replica.$connect();
      this.logger.log('Read replica connected (DATABASE_REPLICA_URL) — public reads use it');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.replica?.$disconnect();
  }

  /**
   * Fails fast when the database is reachable but has no schema.
   *
   * DATABASE_URL names a host and port, not a specific server — so if another
   * Postgres instance is listening on that port it answers instead, and an
   * empty database looks identical to a healthy one until the first query.
   * Without this check the app boots "successfully" and every request 500s
   * with `table public.users does not exist`, which points at the code rather
   * than at the connection.
   */
  private async assertSchemaReady() {
    if (process.env.NODE_ENV === 'test') return;

    const [server] = await this.$queryRaw<
      { db: string; port: string; version: string }[]
    >`select current_database() as db,
             current_setting('port') as port,
             current_setting('server_version') as version`;

    const [{ present }] = await this.$queryRaw<{ present: number }[]>`
      select count(*)::int as present
      from information_schema.tables
      where table_schema = 'public' and table_name = 'users'`;

    if (!present) {
      throw new Error(
        `Database "${server.db}" on port ${server.port} (PostgreSQL ${server.version}) ` +
          `has no "users" table — the schema is not initialised.\n` +
          `  • If this is a new database, run: npx prisma migrate deploy\n` +
          `  • If you expected existing data, you are almost certainly connected to the ` +
          `wrong Postgres instance. Check which server is listening on port ${server.port}.`,
      );
    }

    this.logger.log(
      `Connected to "${server.db}" on port ${server.port} (PostgreSQL ${server.version})`,
    );
  }
}

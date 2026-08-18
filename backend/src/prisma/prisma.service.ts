import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.assertSchemaReady();
  }

  async onModuleDestroy() {
    await this.$disconnect();
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

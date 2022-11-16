import { ENV } from '../src/env';
import * as ley from 'ley';
import { PgStore } from '../src/pg/pg-store';
import { buildApiServer } from '../src/api/init';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

export type TestFastifyServer = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  TypeBoxTypeProvider
>;

export async function cycleMigrations() {
  const config = {
    host: ENV.PGHOST,
    port: ENV.PGPORT,
    user: ENV.PGUSER,
    password: ENV.PGPASSWORD,
    database: ENV.PGDATABASE,
  };
  await ley.down({
    all: true,
    dir: 'migrations',
    driver: 'postgres',
    config: config,
  });
  await ley.up({
    dir: 'migrations',
    driver: 'postgres',
    config: config,
  });
}

export async function startTestApiServer(db: PgStore): Promise<TestFastifyServer> {
  return await buildApiServer({ db });
}

import { ENV } from '../src/env';
import { PgStore } from '../src/pg/pg-store';
import { cycleMigrations, startTestApiServer } from './helpers';
import { request } from 'undici';
import { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { IncomingMessage, Server, ServerResponse } from 'http';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

describe('NFT routes', () => {
  let db: PgStore;
  let fastify: FastifyInstance<
    Server,
    IncomingMessage,
    ServerResponse,
    FastifyBaseLogger,
    TypeBoxTypeProvider
  >;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect();
    await cycleMigrations();
    fastify = await startTestApiServer(db);
  });

  test.skip('return metadata correctly', async () => {
    // TODO: Finish test
    const response = await request('http://127.0.0.1:9999/', { method: 'GET' });
    const json = await response.body.json();
    expect(json).toStrictEqual({ status: 'ok' });
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });
});

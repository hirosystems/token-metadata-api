import { ENV } from '../src/env';
import { PgStore } from '../src/pg/pg-store';
import { cycleMigrations, startTestApiServer, TestFastifyServer } from './helpers';

describe('Status routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = new PgStore();
    await cycleMigrations();
    fastify = await startTestApiServer(db);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  test('returns status when nothing has been processed', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/' });
    const json = response.json();
    expect(json).toStrictEqual({ status: 'ready' });
  });
});

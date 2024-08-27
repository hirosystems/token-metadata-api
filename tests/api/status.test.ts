import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbSipNumber } from '../../src/pg/types';
import {
  insertAndEnqueueTestContractWithTokens,
  startTestApiServer,
  TestFastifyServer,
} from '../helpers';

describe('Status routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await startTestApiServer(db);
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  test('returns status when nothing has been processed', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/metadata/v1/' });
    const json = response.json();
    expect(json).toStrictEqual({
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
      chain_tip: {
        block_height: 1,
      },
    });
    const noVersionResponse = await fastify.inject({ method: 'GET', url: '/metadata/' });
    expect(response.statusCode).toEqual(noVersionResponse.statusCode);
    expect(json).toStrictEqual(noVersionResponse.json());
  });

  test('returns status counts', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    await db.chainhook.updateChainTipBlockHeight(100);

    const response = await fastify.inject({ method: 'GET', url: '/metadata/v1/' });
    const json = response.json();
    expect(json).toStrictEqual({
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
      chain_tip: {
        block_height: 100,
      },
      job_queue: {
        pending: 2,
      },
      token_contracts: {
        'sip-009': 1,
      },
      tokens: {
        nft: 1,
      },
    });
  });
});

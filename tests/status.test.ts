import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbTokenType } from '../src/pg/types';
import { startTestApiServer, TestFastifyServer } from './helpers';

describe('Status routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await startTestApiServer(db);
    await cycleMigrations();
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
    });
    const noVersionResponse = await fastify.inject({ method: 'GET', url: '/metadata/' });
    expect(response.statusCode).toEqual(noVersionResponse.statusCode);
    expect(json).toStrictEqual(noVersionResponse.json());
  });

  test('returns status counts', async () => {
    await db.insertAndEnqueueSmartContract({
      values: {
        principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        sip: DbSipNumber.sip009,
        abi: {
          maps: [],
          functions: [],
          variables: [],
          fungible_tokens: [],
          non_fungible_tokens: [],
        },
        tx_id: '0x1234',
        block_height: 1,
      },
    });
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.nft,
    });

    const response = await fastify.inject({ method: 'GET', url: '/metadata/v1/' });
    const json = response.json();
    expect(json).toStrictEqual({
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
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

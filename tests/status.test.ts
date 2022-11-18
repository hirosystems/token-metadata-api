import { ENV } from '../src/env';
import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbTokenType } from '../src/pg/types';
import { cycleMigrations, startTestApiServer, TestFastifyServer } from './helpers';

describe('Status routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect();
    fastify = await startTestApiServer(db);
    await cycleMigrations();
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

  test('returns status counts', async () => {
    await db.insertAndEnqueueSmartContract({
      values: {
        principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        sip: DbSipNumber.sip009,
        abi: JSON.stringify({
          maps: [],
          functions: [],
          variables: [],
          fungible_tokens: [],
          non_fungible_tokens: [],
        }),
        tx_id: '0x1234',
        block_height: 1,
      },
    });
    const cursor = db.getInsertAndEnqueueTokensCursor({
      smart_contract_id: 1,
      token_count: 1,
      type: DbTokenType.nft,
    });
    for await (const [job] of cursor) {
      // Insertion.
    }

    const response = await fastify.inject({ method: 'GET', url: '/' });
    const json = response.json();
    expect(json).toStrictEqual({
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

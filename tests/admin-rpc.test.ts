import { cycleMigrations } from '@hirosystems/api-toolkit';
import { buildAdminRpcServer } from '../src/admin-rpc/init';
import { ENV } from '../src/env';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { DbJobStatus, DbSipNumber, DbSmartContractInsert, DbTokenType } from '../src/pg/types';
import { TestFastifyServer } from './helpers';

describe('Admin RPC', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await buildAdminRpcServer({ db });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  describe('/refresh-token', () => {
    test('refreshes single token', async () => {
      const values: DbSmartContractInsert = {
        principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.chainhook.insertAndEnqueueSmartContract({ values });
      const inputJobs = await db.chainhook.insertAndEnqueueSequentialTokens({
        smart_contract_id: 1,
        token_count: 1n,
        type: DbTokenType.nft,
      });
      // Simulate done jobs
      await db.sql`UPDATE jobs SET status = ${DbJobStatus.done}`;

      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
          tokenIds: [1],
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);

      const jobs = await db.getPendingJobBatch({ limit: 2 });
      expect(jobs.length).toBe(1);
      expect(jobs[0].token_id).toBe(inputJobs[0].token_id);
    });

    test('refreshes all tokens', async () => {
      const values: DbSmartContractInsert = {
        principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.chainhook.insertAndEnqueueSmartContract({ values });
      const inputJobs = await db.chainhook.insertAndEnqueueSequentialTokens({
        smart_contract_id: 1,
        token_count: 2n,
        type: DbTokenType.nft,
      });
      // Simulate done jobs
      await db.sql`UPDATE jobs SET status = ${DbJobStatus.done}`;

      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);

      const jobs = await db.getPendingJobBatch({ limit: 2 });
      expect(jobs.length).toBe(2);
      expect(jobs[0].token_id).toBe(inputJobs[0].token_id);
      expect(jobs[1].token_id).toBe(inputJobs[1].token_id);
    });

    test('fails on non-existing contract', async () => {
      const response = await fastify.inject({
        url: '/metadata/admin/refresh-token',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error).toMatch(/Contract not found/);
    });
  });

  describe('/retry-failed', () => {
    test('retries failed and invalid jobs', async () => {
      const values: DbSmartContractInsert = {
        principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.chainhook.insertAndEnqueueSmartContract({ values });
      await db.chainhook.insertAndEnqueueSequentialTokens({
        smart_contract_id: 1,
        token_count: 1n,
        type: DbTokenType.nft,
      });
      // Simulate failed jobs
      await db.sql`UPDATE jobs SET status = ${DbJobStatus.failed} WHERE id = 1`;
      await db.sql`UPDATE jobs SET status = ${DbJobStatus.invalid} WHERE id = 2`;

      const response = await fastify.inject({
        url: '/metadata/admin/retry-failed',
        method: 'POST',
        payload: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);

      const jobs = await db.getPendingJobBatch({ limit: 2 });
      expect(jobs.length).toBe(2);
    });
  });
});

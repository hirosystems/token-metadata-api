import { cycleMigrations } from '@hirosystems/api-toolkit';
import { buildAdminRpcServer } from '../src/admin-rpc/init';
import { ENV } from '../src/env';
import { BlockchainDbSmartContract } from '../src/pg/blockchain-api/pg-blockchain-api-store';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { DbJobStatus, DbSipNumber, DbSmartContractInsert, DbTokenType } from '../src/pg/types';
import {
  MockPgBlockchainApiStore,
  SIP_010_ABI,
  TestFastifyServer,
  enqueueToken,
  sleep,
} from './helpers';

describe('Admin RPC', () => {
  let db: PgStore;
  let apiDb: MockPgBlockchainApiStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    ENV.BLOCKCHAIN_API_PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    apiDb = new MockPgBlockchainApiStore();
    fastify = await buildAdminRpcServer({ db, apiDb });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  describe('/import-contract', () => {
    test('imports new contract', async () => {
      const contract: BlockchainDbSmartContract = {
        contract_id: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        tx_id: '0x1234',
        block_height: 1,
        abi: SIP_010_ABI,
      };
      apiDb.smartContract = contract;

      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);

      const imported = await db.getSmartContract({
        principal: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
      });
      expect(imported).not.toBeUndefined();
      const job = await db.getPendingJobBatch({ limit: 1 });
      expect(job[0].smart_contract_id).toBe(imported?.id);
      expect(job[0].status).toBe(DbJobStatus.pending);
    });

    test('re-enqueues existing contract', async () => {
      const contract: BlockchainDbSmartContract = {
        contract_id: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        tx_id: '0x1234',
        block_height: 1,
        abi: SIP_010_ABI,
      };
      apiDb.smartContract = contract;
      const values: DbSmartContractInsert = {
        principal: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        sip: DbSipNumber.sip010,
        abi: SIP_010_ABI,
        tx_id: '0x1234',
        block_height: 1,
      };
      const job1 = await db.insertAndEnqueueSmartContract({ values });
      // Simulate done job
      await db.sql`UPDATE jobs SET status = ${DbJobStatus.done}`;

      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);

      const job2 = await db.getJob({ id: job1.id });
      expect(job2?.status).toBe(DbJobStatus.pending);
    });

    test('fails on non-existing contract', async () => {
      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error).toMatch(/Contract not found/);
    });

    test('fails on non-token contract', async () => {
      const contract: BlockchainDbSmartContract = {
        contract_id: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        tx_id: '0x1234',
        block_height: 1,
        abi: '"test"',
      };
      apiDb.smartContract = contract;

      const response = await fastify.inject({
        url: '/metadata/admin/import-contract',
        method: 'POST',
        payload: JSON.stringify({
          contractId: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error).toMatch(/Not a token contract/);
    });
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
      await db.insertAndEnqueueSmartContract({ values });
      const inputJobs = await db.insertAndEnqueueSequentialTokens({
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
      await db.insertAndEnqueueSmartContract({ values });
      const inputJobs = await db.insertAndEnqueueSequentialTokens({
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
      await db.insertAndEnqueueSmartContract({ values });
      await db.insertAndEnqueueSequentialTokens({
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

  describe('/cache-images', () => {
    test('reprocesses token images', async () => {
      ENV.METADATA_IMAGE_CACHE_PROCESSOR = './tests/test-image-cache.js';
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await enqueueToken(db, principal);
      await db.updateProcessedTokenWithMetadata({
        id: 1,
        values: {
          token: {
            name: 'hello-world',
            symbol: 'HELLO',
            decimals: 6,
            total_supply: '1',
            uri: 'http://test.com/uri.json',
          },
          metadataLocales: [
            {
              metadata: {
                sip: 16,
                token_id: 1,
                name: 'hello-world',
                l10n_locale: 'en',
                l10n_uri: null,
                l10n_default: true,
                description: 'test',
                image: 'http://test.com/image.png',
                cached_image: null,
                cached_thumbnail_image: null,
              },
            },
          ],
        },
      });
      const response = await fastify.inject({
        url: '/metadata/admin/cache-images',
        method: 'POST',
        payload: JSON.stringify({
          contractId: principal,
        }),
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(200);
      await sleep(1000); // Wait for changes to complete.
      const bundle = await db.getTokenMetadataBundle({
        contractPrincipal: principal,
        tokenNumber: 1,
      });
      expect(bundle.metadataLocale?.metadata.cached_image).toBe(
        'http://test.com/image.png?processed=true'
      );
      expect(bundle.metadataLocale?.metadata.cached_thumbnail_image).toBe(
        'http://test.com/image.png?processed=true&thumb=true'
      );
    });
  });
});

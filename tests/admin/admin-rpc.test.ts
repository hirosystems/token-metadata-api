import * as imageCache from '../../src/token-processor/images/image-cache';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { buildAdminRpcServer } from '../../src/admin-rpc/init';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbJobStatus, DbSipNumber } from '../../src/pg/types';
import {
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestFastifyServer,
} from '../helpers';
import { JobQueue } from '../../src/token-processor/queue/job-queue';

describe('Admin RPC', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;
  let jobQueue: JobQueue;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    jobQueue = new JobQueue({ db });
    fastify = await buildAdminRpcServer({ db, jobQueue });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  describe('/refresh-token', () => {
    test('refreshes single token', async () => {
      const inputJobs = await insertAndEnqueueTestContractWithTokens(
        db,
        'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        DbSipNumber.sip009,
        1n
      );
      await markAllJobsAsDone(db);

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
      const inputJobs = await insertAndEnqueueTestContractWithTokens(
        db,
        'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        DbSipNumber.sip009,
        2n
      );
      await markAllJobsAsDone(db);

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
      await insertAndEnqueueTestContractWithTokens(
        db,
        'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
        DbSipNumber.sip009,
        1n
      );
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
      const spy = jest
        .spyOn(imageCache, 'reprocessTokenImageCache')
        .mockImplementation((a, b, c) => {
          return Promise.resolve();
        });

      ENV.IMAGE_CACHE_PROCESSOR_ENABLED = true;
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip009, 1n);
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

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    test('rejects when image cache is disabled', async () => {
      ENV.IMAGE_CACHE_PROCESSOR_ENABLED = false;
      const principal = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
      await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip009, 1n);
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
      expect(response.statusCode).toBe(422);
    });
  });
});

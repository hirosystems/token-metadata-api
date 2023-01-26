import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { DbJob, DbSipNumber, DbSmartContractInsert } from '../src/pg/types';
import { RetryableJobError } from '../src/token-processor/queue/errors';
import { Job } from '../src/token-processor/queue/job/job';

class TestRetryableJob extends Job {
  description(): string {
    return 'test';
  }
  protected handler(): Promise<void> {
    throw new RetryableJobError('test');
  }
}

describe('Job', () => {
  let db: PgStore;
  let dbJob: DbJob;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
    const values: DbSmartContractInsert = {
      principal: 'ABCD.test-ft',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    dbJob = await db.insertAndEnqueueSmartContract({ values });
  });

  afterEach(async () => {
    await db.close();
  });

  test('retryable error increases retry_count', async () => {
    const job = new TestRetryableJob({ db, job: dbJob });

    await expect(job.work()).resolves.not.toThrow();
    const jobs1 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs1[0].retry_count).toBe(1);
    expect(jobs1[0].status).toBe('pending');

    await expect(job.work()).resolves.not.toThrow();
    const jobs2 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs2[0].retry_count).toBe(2);
    expect(jobs2[0].status).toBe('pending');
  });

  test('retry_count limit reached marks entry as failed', async () => {
    ENV.JOB_QUEUE_STRICT_MODE = false;
    ENV.JOB_QUEUE_MAX_RETRIES = 0;
    const job = new TestRetryableJob({ db, job: dbJob });

    await expect(job.work()).resolves.not.toThrow();
    const status = await db.sql<{ status: string }[]>`SELECT status FROM jobs`;
    expect(status[0].status).toBe('failed');
  });

  test('strict mode ignores retry_count limit', async () => {
    ENV.JOB_QUEUE_STRICT_MODE = true;
    ENV.JOB_QUEUE_MAX_RETRIES = 0;
    const job = new TestRetryableJob({ db, job: dbJob });

    await expect(job.work()).resolves.not.toThrow();
    const jobs1 = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs1[0].retry_count).toBe(1);
    expect(jobs1[0].status).toBe('pending');
  });
});

import { ENV } from '../src/env';
import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbSmartContractInsert } from '../src/pg/types';
import { JobQueue } from '../src/token-processor/queue/job-queue';
import { cycleMigrations } from './helpers';

describe('JobQueue', () => {
  let db: PgStore;
  let queue: JobQueue;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
    queue = new JobQueue({ db });
  });

  afterEach(async () => {
    await db.close();
  });

  test('skips adding job if queue is at limit', async () => {
    ENV.JOB_QUEUE_SIZE_LIMIT = 1;

    const values1: DbSmartContractInsert = {
      principal: 'ABCD.test-ft',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    const job1 = await db.insertAndEnqueueSmartContract({ values: values1 });
    await queue.add(job1);

    const count1 = await db.sql<
      { count: number }[]
    >`SELECT COUNT(*) FROM jobs WHERE status = 'queued'`;
    expect(count1.count).toBe(1);

    const values2: DbSmartContractInsert = {
      principal: 'ABCD.test-ft2',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    const job2 = await db.insertAndEnqueueSmartContract({ values: values2 });
    await queue.add(job2);

    const count2 = await db.sql<
      { count: number }[]
    >`SELECT COUNT(*) FROM jobs WHERE status = 'queued'`;
    expect(count2.count).toBe(1);
  });
});

import * as postgres from 'postgres';
import { ENV } from '../src/env';
import { PgStore } from '../src/pg/pg-store';
import { DbJob, DbJobStatus, DbSipNumber, DbSmartContractInsert } from '../src/pg/types';
import { JobQueue } from '../src/token-processor/queue/job-queue';
import { cycleMigrations } from '../src/pg/migrations';
import { PgBlockchainApiStore } from '../src/pg/blockchain-api/pg-blockchain-api-store';

class TestJobQueue extends JobQueue {
  constructor(args: { db: PgStore; apiDb: PgBlockchainApiStore }) {
    super(args);
    this['isRunning'] = true; // Simulate a running queue.
  }
  async testAdd(job: DbJob): Promise<void> {
    return this.add(job);
  }
  async testAddJobBatch(): Promise<number> {
    return this.addJobBatch();
  }
}

describe('JobQueue', () => {
  let db: PgStore;
  let queue: TestJobQueue;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
    queue = new TestJobQueue({ db, apiDb: new PgBlockchainApiStore(postgres()) });
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
    await queue.testAdd(job1);

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
    await queue.testAdd(job2);

    const count2 = await db.sql<
      { count: number }[]
    >`SELECT COUNT(*) FROM jobs WHERE status = 'queued'`;
    expect(count2.count).toBe(1);
  });

  test('adds job batches for processing', async () => {
    ENV.JOB_QUEUE_SIZE_LIMIT = 10;

    const values1: DbSmartContractInsert = {
      principal: 'ABCD.test-ft',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    const job1 = await db.insertAndEnqueueSmartContract({ values: values1 });
    // Set it as queued already as if something had gone wrong.
    await db.sql`UPDATE jobs SET status='queued' WHERE id=${job1.id}`;

    const values2: DbSmartContractInsert = {
      principal: 'ABCD.test-ft2',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    const job2 = await db.insertAndEnqueueSmartContract({ values: values2 });

    const values3: DbSmartContractInsert = {
      principal: 'ABCD.test-ft3',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    const job3 = await db.insertAndEnqueueSmartContract({ values: values3 });

    // Queued is taken first.
    const added1 = await queue.testAddJobBatch();
    expect(added1).toBe(1);
    expect((await db.getJob({ id: job1.id }))?.status).toBe('queued');
    expect((await db.getJob({ id: job2.id }))?.status).toBe('pending');
    expect((await db.getJob({ id: job3.id }))?.status).toBe('pending');

    // All of the rest are taken.
    await db.updateJobStatus({ id: job1.id, status: DbJobStatus.done });
    const added2 = await queue.testAddJobBatch();
    expect(added2).toBe(2);
    expect((await db.getJob({ id: job1.id }))?.status).toBe('done');
    expect((await db.getJob({ id: job2.id }))?.status).toBe('queued');
    expect((await db.getJob({ id: job3.id }))?.status).toBe('queued');
  });
});

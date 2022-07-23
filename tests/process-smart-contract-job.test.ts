import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbSmartContractInsert } from '../src/pg/types';
import { ProcessSmartContractJob } from '../src/token-processor/process-smart-contract-job';
import { JobQueue } from '../src/token-processor/queue/job-queue';
import { ENV } from '../src/util/env';
import { cycleMigrations } from './helpers';

describe('ProcessSmartContractJob', () => {
  let db: PgStore;
  let queue: JobQueue;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    await cycleMigrations();
    db = new PgStore();
    queue = new JobQueue({ db: db });
  });

  test('ignores completed jobs', () => {
    const values: DbSmartContractInsert = {
      principal: 'ABCD.test',
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x12345',
      block_height: 1
    };
    const job = await db.insertAndEnqueueSmartContract()
    const processor = new ProcessSmartContractJob({ db, queue });
  });
});

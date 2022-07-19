import PQueue from 'p-queue';
import { ENV } from '../..';
import { PgStore } from '../../pg/pg-store';
import { DbJob } from '../../pg/types';
import { ProcessSmartContractJob } from '../process-smart-contract-job';
import { ProcessTokenJob } from '../process-token-job';

export class JobQueue {
  protected readonly queue: PQueue;
  protected readonly db: PgStore;

  constructor(args: {
    db: PgStore
  }) {
    this.db = args.db;
    this.queue = new PQueue({
      concurrency: ENV.METADATA_QUEUE_CONCURRENCY_LIMIT,
      autoStart: true
    });
  }

  add(job: DbJob): void {
    if (job.token_id) {
      this.queue.add(async () => {
        await (new ProcessTokenJob({ db: this.db, queue: this, job: job })).work();
      });
    } else if (job.smart_contract_id) {
      this.queue.add(async () => {
        await (new ProcessSmartContractJob({ db: this.db, queue: this, job: job })).work();
      });
    }
  }

  close() {
    this.queue.pause();
    this.queue.clear();
  }
}

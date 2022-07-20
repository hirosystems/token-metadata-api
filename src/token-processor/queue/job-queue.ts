import PQueue from 'p-queue';
import { ENV } from '../..';
import { PgStore } from '../../pg/pg-store';
import { DbJob, DbJobStatus } from '../../pg/types';
import { ProcessSmartContractJob } from '../process-smart-contract-job';
import { ProcessTokenJob } from '../process-token-job';

export class JobQueue {
  private readonly queue: PQueue;
  private readonly db: PgStore;

  constructor(args: {
    db: PgStore
  }) {
    this.db = args.db;
    this.queue = new PQueue({
      concurrency: ENV.JOB_QUEUE_CONCURRENCY_LIMIT,
      autoStart: false
    });
    this.queue.on('idle', () => this.replenishEmptyQueue());
  }

  add(job: DbJob): void {
    if ((this.queue.size + this.queue.pending) >= ENV.JOB_QUEUE_SIZE_LIMIT) {
      // To avoid backpressure, we won't add this job to the queue. It will be processed later when
      // the empty queue gets replenished with pending jobs.
      return;
    }
    this.db.updateJobStatus({ id: job.id, status: DbJobStatus.queued })
      .then(() => {
        this.queue.add(async () => {
          if (job.token_id) {
            await (new ProcessTokenJob({ db: this.db, queue: this, job: job })).work();
          } else if (job.smart_contract_id) {
            await (new ProcessSmartContractJob({ db: this.db, queue: this, job: job })).work();
          }
        });
      });
  }

  start() {
    this.queue.start();
  }

  close() {
    this.queue.pause();
    this.queue.clear();
  }

  private async replenishEmptyQueue() {
    this.queue.pause();
    console.info(`JobQueue replenishing empty queue`);
    const jobs = await this.db.getWaitingJobBatch({ limit: ENV.JOB_QUEUE_SIZE_LIMIT });
    for (const job of jobs) {
      this.add(job);
    }
    this.queue.start();
  }
}

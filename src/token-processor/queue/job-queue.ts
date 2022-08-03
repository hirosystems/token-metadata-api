import PQueue from 'p-queue';
import { PgStore } from '../../pg/pg-store';
import { DbJob, DbJobStatus } from '../../pg/types';
import { ENV } from '../../env';
import { ProcessSmartContractJob } from '../process-smart-contract-job';
import { ProcessTokenJob } from '../process-token-job';

export enum TokenMetadataProcessingMode {
  /**
   * If a recoverable processing error occurs, we'll try again until the max retry attempt is
   * reached. See `.env`
   **/
  default,
  /** If a recoverable processing error occurs, we'll try again indefinitely. */
  strict,
}

/**
 * Contains a priority queue that organizes all necessary work for contract ingestion and token
 * metadata processing.
 */
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
            await (new ProcessTokenJob({ db: this.db, job: job })).work();
          } else if (job.smart_contract_id) {
            await (new ProcessSmartContractJob({ db: this.db, job: job })).work();
          }
        });
      });
  }

  start() {
    this.queue.start();
  }

  close() {
    this.queue.removeListener('idle');
    this.queue.pause();
    this.queue.clear();
  }

  private async replenishEmptyQueue() {
    this.queue.pause();
    const jobs = await this.db.getPendingJobBatch({ limit: ENV.JOB_QUEUE_SIZE_LIMIT });
    if (jobs.length === 0) {
      console.info(`JobQueue has no more work to do`);
      // FIXME: When to restart?
    } else {
      console.info(`JobQueue replenishing empty queue`);
      for (const job of jobs) {
        this.add(job);
      }
      this.queue.start();
    }
  }
}

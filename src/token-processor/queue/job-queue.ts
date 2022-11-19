import PQueue from 'p-queue';
import { PgStore } from '../../pg/pg-store';
import { DbJob, DbJobStatus } from '../../pg/types';
import { ENV } from '../../env';
import { ProcessSmartContractJob } from '../process-smart-contract-job';
import { ProcessTokenJob } from '../process-token-job';
import { timeout } from '../../pg/postgres-tools/helpers';

/**
 * A priority queue that organizes all necessary work for contract ingestion and token metadata
 * processing.
 *
 * Every job processed by this queue is defined as a `Job` subclass and strictly corresponds to one
 * row in the `jobs` DB table, which marks its processing status and related objects to be worked on
 * (smart contract or token). Each of these job rows are usually created during smart contract
 * import and/or processing (see `BlockchainImporter` and `ProcessSmartContractJob`), but new jobs
 * could be added to the DB by any other class in the future, even while the queue is operating.
 *
 * This object essentially runs an infinite loop that follows these steps:
 * 1. Upon `start()`, it fetches a set number of job rows that are `'pending'` and loads their
 *    corresponding `Job` objects into memory for processing, marking those rows now as `'queued'`.
 * 2. It executes each loaded job to completion concurrently. Depending on success or failure, the
 *    job row is marked as either `'done'` or `'failed'`.
 * 3. Once all loaded jobs are done (and the queue is now idle), it goes back to step 1. If there
 *    are no more jobs to be processed, however, the queue is paused.
 *
 * There are two env vars that can help you tune how the queue performs:
 * * `ENV.JOB_QUEUE_SIZE_LIMIT`: The in-memory size of the queue, i.e. the number of pending jobs
 *    that are loaded from the database while they wait for execution (see step 1 above).
 * * `ENV.JOB_QUEUE_CONCURRENCY_LIMIT`: The number of jobs that will be ran simultaneously.
 *
 * This queue runs continuously and can handle an unlimited number of jobs.
 */
export class JobQueue {
  private readonly queue: PQueue;
  private readonly db: PgStore;

  constructor(args: { db: PgStore }) {
    this.db = args.db;
    this.queue = new PQueue({
      concurrency: ENV.JOB_QUEUE_CONCURRENCY_LIMIT,
      autoStart: false,
    });
  }

  /**
   * Loads a job into the queue for execution. The `DbJob` row will be marked as `'queued'` while it
   * waits for processing. A `Job` subclass will be instantiated depending on the type of job this
   * row describes.
   * @param job - A row from the `jobs` DB table that needs processing
   */
  async add(job: DbJob): Promise<void> {
    if (this.queue.size + this.queue.pending >= ENV.JOB_QUEUE_SIZE_LIMIT) {
      // To avoid backpressure, we won't add this job to the queue. It will be processed later when
      // the empty queue gets replenished with pending jobs.
      return;
    }
    await this.db.updateJobStatus({ id: job.id, status: DbJobStatus.queued });
    void this.queue.add(async () => {
      if (job.token_id) {
        await new ProcessTokenJob({ db: this.db, job: job }).work();
      } else if (job.smart_contract_id) {
        await new ProcessSmartContractJob({ db: this.db, job: job }).work();
      }
    });
  }

  /**
   * Starts executing queue jobs. Jobs had to be previously loaded via `add()` for processing to
   * begin.
   */
  start() {
    console.log(`JobQueue starting queue...`);
    this.queue.start();
    void this.runQueueLoop();
  }

  /**
   * Shuts down the queue.
   */
  close() {
    this.queue.removeListener('idle');
    this.queue.pause();
    this.queue.clear();
    console.log(`JobQueue closed queue`);
  }

  /**
   * Infinite loop that replenishes the queue by taking rows from the `jobs` table that are marked
   * `'pending'` and pushing them for execution. Once the queue is idle, it grabs more jobs for
   * processing, repeating this cycle until the jobs table is completely processed.
   */
  private async runQueueLoop() {
    while (!this.queue.isPaused) {
      const jobs = await this.db.getPendingJobBatch({ limit: ENV.JOB_QUEUE_SIZE_LIMIT });
      if (jobs.length > 0) {
        for (const job of jobs) {
          await this.add(job);
        }
      } else {
        // Wait a few seconds before checking for more jobs.
        await timeout(5_000);
      }
      await this.queue.onEmpty();
    }
  }
}

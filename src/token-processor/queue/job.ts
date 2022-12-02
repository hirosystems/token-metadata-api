import { ENV } from '../../env';
import { logger } from '../../logger';
import { PgStore } from '../../pg/pg-store';
import { stopwatch } from '../../pg/postgres-tools/helpers';
import { DbJob, DbJobStatus } from '../../pg/types';
import { RetryableJobError } from './errors';
import { getJobQueueProcessingMode, JobQueueProcessingMode } from './helpers';

/**
 * An abstract class for a job that will be processed by `JobQueue`. It only contains logic for
 * handling job work SQL transactions and errors that may or may not be retried.
 */
export abstract class Job {
  protected readonly db: PgStore;
  protected readonly job: DbJob;

  constructor(args: { db: PgStore; job: DbJob }) {
    this.db = args.db;
    this.job = args.job;
  }

  /**
   * A human readable description of the work this job performs.
   */
  abstract description(): string;

  /**
   * The actual handler that performs this job's work. This method must be overridden by subclasses.
   */
  protected abstract handler(): Promise<void>;

  /**
   * Called by the `JobQueue` when this job is about to be processed. This method is final and
   * shouldn't be overridden.
   */
  async work(): Promise<void> {
    let processingFinished = false;
    let finishedWithError = false;
    const sw = stopwatch();

    // This sql transaction will catch any and all errors that are generated while processing the
    // job. Each of them were previously tagged as retryable or not retryable so we'll make a
    // decision here about what to do in each case. If we choose to retry, this queue entry will
    // simply not be marked as `processed = true` so it can be picked up by the queue at a later
    // time.
    try {
      await this.db.sqlWriteTransaction(async sql => {
        await this.handler();
        processingFinished = true;
      });
    } catch (error) {
      if (error instanceof RetryableJobError) {
        const retries = await this.db.increaseJobRetryCount({ id: this.job.id });
        if (
          getJobQueueProcessingMode() === JobQueueProcessingMode.strict ||
          retries <= ENV.JOB_QUEUE_MAX_RETRIES
        ) {
          logger.info(
            `Job ${this.description()} recoverable error, trying again later: ${error.message}`
          );
          await this.db.updateJobStatus({ id: this.job.id, status: DbJobStatus.pending });
        } else {
          console.warn(
            `Job ${this.description()} max retries reached, giving up: ${error.message}`
          );
          processingFinished = true;
          finishedWithError = true;
        }
      } else {
        // Something more serious happened, mark this token as failed.
        logger.error(`Job ${this.description()}: ${error}`);
        processingFinished = true;
        finishedWithError = true;
      }
    } finally {
      if (processingFinished) {
        const status = finishedWithError ? DbJobStatus.failed : DbJobStatus.done;
        await this.db.updateJobStatus({
          id: this.job.id,
          status: status,
        });
        logger.info(`Job ${this.description()} ${status} in ${sw.getElapsed()}ms`);
      }
    }
  }
}

import { logger, stopwatch } from '@hirosystems/api-toolkit';
import { ENV } from '../../../env';
import { PgStore } from '../../../pg/pg-store';
import { DbJob, DbJobStatus } from '../../../pg/types';
import { UserError } from '../../util/errors';
import { RetryableJobError } from '../errors';
import { getJobQueueProcessingMode, JobQueueProcessingMode } from '../helpers';

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
    let status: DbJobStatus | undefined;
    const sw = stopwatch();

    // This block will catch any and all errors that are generated while processing the job. Each of
    // them were previously tagged as retryable or not retryable so we'll make a decision here about
    // what to do in each case. If we choose to retry, this queue entry will simply not be marked as
    // `processed = true` so it can be picked up by the queue at a later time.
    try {
      await this.handler();
      status = DbJobStatus.done;
    } catch (error) {
      if (error instanceof RetryableJobError) {
        const retries = await this.db.increaseJobRetryCount({ id: this.job.id });
        if (
          getJobQueueProcessingMode() === JobQueueProcessingMode.strict ||
          retries <= ENV.JOB_QUEUE_MAX_RETRIES
        ) {
          logger.warn(
            error,
            `Job ${this.description()} recoverable error after ${sw.getElapsed()}ms, trying again later`
          );
          await this.updateStatus(DbJobStatus.pending);
        } else {
          logger.warn(error, `Job ${this.description()} max retries reached, giving up`);
          status = DbJobStatus.failed;
        }
      } else if (error instanceof UserError) {
        logger.error(error, `User error on Job ${this.description()}`);
        status = DbJobStatus.invalid;
      } else {
        logger.error(error, `Job ${this.description()}`);
        status = DbJobStatus.failed;
      }
    } finally {
      if (status) {
        if (await this.updateStatus(status)) {
          logger.info(`Job ${this.description()} ${status} in ${sw.getElapsed()}ms`);
        }
      }
    }
  }

  private async updateStatus(status: DbJobStatus): Promise<boolean> {
    try {
      await this.db.updateJobStatus({ id: this.job.id, status: status });
      return true;
    } catch (error) {
      logger.error(`Job ${this.description()} could not update status to ${status}: ${error}`);
      return false;
    }
  }
}

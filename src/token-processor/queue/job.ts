import { ENV } from '../../env';
import { PgStore } from '../../pg/pg-store';
import { DbJob } from '../../pg/types';
import { RetryableTokenMetadataError } from '../util/errors';
import { getTokenMetadataProcessingMode } from '../util/helpers';
import { TokenMetadataProcessingMode } from './job-queue';

export abstract class Job {
  protected readonly db: PgStore;
  protected readonly job: DbJob;

  constructor(args: { db: PgStore; job: DbJob }) {
    this.db = args.db;
    this.job = args.job;
  }

  protected abstract handler(): Promise<void>;

  /**
   * This method is final and shouldn't be overridden.
   */
  async work(): Promise<void> {
    await this.db
      .sqlTransaction(async sql => {
        await this.handler();
      })
      .catch(async error => {
        if (error instanceof RetryableTokenMetadataError) {
          const retries = await this.db.increaseJobRetryCount({
            id: this.job.id,
          });
          if (
            getTokenMetadataProcessingMode() === TokenMetadataProcessingMode.strict ||
            retries <= ENV.METADATA_MAX_RETRIES
          ) {
            console.info(
              `ProcessTokenJob a recoverable error happened while processing ${this.tokenDescription(
                token,
                contract
              )}, trying again later: ${error}`
            );
            await this.db.updateJobStatus({ id: this.job.id, status: DbJobStatus.pending });
          } else {
            console.warn(
              `ProcessTokenJob max retries reached while processing ${this.tokenDescription(
                token,
                contract
              )}, giving up: ${error}`
            );
            processingFinished = true;
            finishedWithError = true;
          }
        }
      });
  }
}

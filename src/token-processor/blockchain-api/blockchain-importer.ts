import { ClarityAbi } from '@stacks/transactions';
import { logger } from '../../logger';
import { PgBlockchainApiStore } from '../../pg/blockchain-api/pg-blockchain-api-store';
import { PgStore } from '../../pg/pg-store';
import { isPgConnectionError } from '../../pg/postgres-tools/errors';
import { timeout } from '../../pg/postgres-tools/helpers';
import { waiter, Waiter } from '../util/helpers';
import {
  getContractLogMetadataUpdateNotification,
  getSmartContractSip,
} from '../util/sip-validation';
import { ContractNotFoundError } from '../../pg/errors';

export class SmartContractImportInterruptedError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

class ApiBlockHeightNotReadyError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

/**
 * Imports token contracts and SIP-019 token metadata update notifications from the Stacks
 * Blockchain API database.
 */
export class BlockchainImporter {
  private readonly db: PgStore;
  private readonly apiDb: PgBlockchainApiStore;
  private apiBlockHeightRetryIntervalMs = 5000;
  private startingBlockHeight: number;
  private importInterruptWaiter: Waiter<void>;
  private importInterrupted = false;
  private importFinished = false;

  constructor(args: { db: PgStore; apiDb: PgBlockchainApiStore; startingBlockHeight: number }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
    this.startingBlockHeight = args.startingBlockHeight;
    this.importInterruptWaiter = waiter();
  }

  async close() {
    if (this.importFinished) {
      return;
    }
    // Force the cursor to stop and wait.
    this.importInterrupted = true;
    await this.importInterruptWaiter;
  }

  async import() {
    logger.info(`BlockchainImporter last imported block height: ${this.startingBlockHeight}`);
    while (!this.importFinished) {
      try {
        const apiBlockHeight = await this.getApiBlockHeight();
        await this.importSmartContracts(this.startingBlockHeight, apiBlockHeight);
        await this.importTokenMetadataRefreshNotifications(
          this.startingBlockHeight,
          apiBlockHeight
        );
        await this.db.updateChainTipBlockHeight({ blockHeight: apiBlockHeight });

        // Did the Stacks chain advance while we were importing? If so, run the loop again from our
        // last seen block height to the new block height.
        const newApiBlockHeight = await this.getApiBlockHeight();
        if (apiBlockHeight === newApiBlockHeight) {
          this.importFinished = true;
        } else {
          this.startingBlockHeight = apiBlockHeight;
        }
      } catch (error) {
        if (isPgConnectionError(error)) {
          logger.error(
            error,
            'BlockchainImporter encountered a PG connection error during import, retrying...'
          );
          await timeout(1000);
        } else if (error instanceof ApiBlockHeightNotReadyError) {
          logger.warn(`BlockchainImporter API block height too low, retrying...`);
          await timeout(this.apiBlockHeightRetryIntervalMs);
        } else if (error instanceof SmartContractImportInterruptedError) {
          this.importInterruptWaiter.finish();
          throw error;
        } else {
          throw error;
        }
      }
    }
  }

  private async getApiBlockHeight(): Promise<number> {
    const blockHeight = (await this.apiDb.getCurrentBlockHeight()) ?? 1;
    logger.info(`BlockchainImporter API block height: ${blockHeight}`);
    if (this.startingBlockHeight > blockHeight) {
      throw new ApiBlockHeightNotReadyError();
    }
    return blockHeight;
  }

  /**
   * Scans the `smart_contracts` table in the Stacks Blockchain API postgres DB for every smart
   * contract that exists in the blockchain. It then takes all of them which declare tokens and
   * enqueues them for processing.
   * @param fromBlockHeight - Minimum block height
   * @param toBlockHeight - Maximum block height
   */
  private async importSmartContracts(fromBlockHeight: number, toBlockHeight: number) {
    logger.info(
      `BlockchainImporter smart contract import at block heights ${fromBlockHeight} to ${toBlockHeight}`
    );
    const cursor = this.apiDb.getSmartContractsCursor({ fromBlockHeight, toBlockHeight });
    for await (const rows of cursor) {
      for (const row of rows) {
        if (this.importInterrupted) {
          // We've received a SIGINT, so stop the import and throw an error so we don't proceed with
          // booting the rest of the service.
          throw new SmartContractImportInterruptedError();
        }
        const sip = getSmartContractSip(row.abi as ClarityAbi);
        if (!sip) {
          continue; // Not a token contract.
        }
        await this.db.insertAndEnqueueSmartContract({
          values: {
            principal: row.contract_id,
            sip: sip,
            abi: row.abi,
            tx_id: row.tx_id,
            block_height: row.block_height,
          },
        });
        logger.info(`BlockchainImporter detected token contract (${sip}): ${row.contract_id}`);
      }
    }
    logger.info(`BlockchainImporter smart contract import finished`);
  }

  /**
   * Scans the `contract_logs` table in the API DB looking for SIP-019 notifications we might have
   * missed while the service was unavailable. It enqueues tokens for refresh if it finds any.
   * @param fromBlockHeight - Minimum block height
   * @param toBlockHeight - Maximum block height
   */
  private async importTokenMetadataRefreshNotifications(
    fromBlockHeight: number,
    toBlockHeight: number
  ) {
    if (fromBlockHeight === 1) {
      // There's no point in importing refresh notifications if we're only just making the initial
      // blockchain import and we don't have any previous tokens that might need refreshing.
      return;
    }
    logger.info(
      `BlockchainImporter token metadata update notification import at block heights ${fromBlockHeight} to ${toBlockHeight}`
    );
    const cursor = this.apiDb.getSmartContractLogsCursor({ fromBlockHeight, toBlockHeight });
    for await (const rows of cursor) {
      for (const row of rows) {
        if (this.importInterrupted) {
          // We've received a SIGINT, so stop the import and throw an error so we don't proceed with
          // booting the rest of the service.
          throw new SmartContractImportInterruptedError();
        }
        const notification = getContractLogMetadataUpdateNotification(row);
        if (!notification) {
          continue; // Not a token contract.
        }
        logger.info(
          `BlockchainImporter detected SIP-019 notification for ${notification.contract_id} ${
            notification.token_ids ?? []
          }`
        );
        try {
          await this.db.enqueueTokenMetadataUpdateNotification({ notification });
        } catch (error) {
          if (error instanceof ContractNotFoundError) {
            logger.warn(
              `Contract ${notification.contract_id} not found, unable to process SIP-019 notification`
            );
          } else {
            throw error;
          }
        }
      }
    }
    logger.info(`BlockchainImporter token metadata update notification import finished`);
  }
}

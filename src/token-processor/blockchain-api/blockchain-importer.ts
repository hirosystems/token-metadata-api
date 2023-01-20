import { ClarityAbi } from '@stacks/transactions';
import { logger } from '../../logger';
import {
  BlockchainDbSmartContract,
  PgBlockchainApiStore,
} from '../../pg/blockchain-api/pg-blockchain-api-store';
import { PgStore } from '../../pg/pg-store';
import { isPgConnectionError } from '../../pg/postgres-tools/errors';
import { timeout } from '../../pg/postgres-tools/helpers';
import { waiter, Waiter } from '../util/helpers';
import { getSmartContractSip } from '../util/sip-validation';

export class SmartContractImportInterruptedError extends Error {
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
  private readonly startingBlockHeight: number;
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
    while (!this.importFinished) {
      try {
        const currentBlockHeight = (await this.apiDb.getCurrentBlockHeight()) ?? 1;
        await this.importSmartContracts(this.startingBlockHeight, currentBlockHeight);
        // TODO: Import SIP-019 notifications.
        this.importFinished = true;
      } catch (error) {
        if (isPgConnectionError(error)) {
          logger.error(
            `BlockchainImporter encountered a PG connection error during import, retrying...`,
            error
          );
          await timeout(100);
        } else if (error instanceof SmartContractImportInterruptedError) {
          this.importInterruptWaiter.finish();
          throw error;
        } else {
          throw error;
        }
      }
    }
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
            abi: JSON.stringify(row.abi),
            tx_id: row.tx_id,
            block_height: row.block_height,
          },
        });
        logger.info(`BlockchainImporter detected token contract (${sip}): ${row.contract_id}`);
      }
    }
    logger.info(`BlockchainImporter smart contract import finished`);
  }
}

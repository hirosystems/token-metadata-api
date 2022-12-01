import { ClarityAbi } from '@stacks/transactions';
import {
  BlockchainDbSmartContract,
  PgBlockchainApiStore,
} from '../../pg/blockchain-api/pg-blockchain-api-store';
import { PgStore } from '../../pg/pg-store';
import { isPgConnectionError } from '../../pg/postgres-tools/errors';
import { timeout } from '../../pg/postgres-tools/helpers';
import { waiter, Waiter } from '../util/helpers';
import {
  getContractLogMetadataUpdateNotification,
  getSmartContractSip,
} from '../util/sip-validation';

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
  private importInterruptWaiter: Waiter<void>;
  private importInterrupted = false;
  private importFinished = false;

  constructor(args: { db: PgStore; apiDb: PgBlockchainApiStore }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
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
        const afterBlockHeight = (await this.db.getSmartContractsMaxBlockHeight()) ?? 1;
        await this.importSmartContracts(afterBlockHeight);
        this.importFinished = true;
      } catch (error) {
        if (isPgConnectionError(error)) {
          console.error(
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
   * @param afterBlockHeight - Minimum block height
   */
  private async importSmartContracts(afterBlockHeight: number) {
    console.info(
      `BlockchainImporter smart contract import starting at block height ${afterBlockHeight}`
    );
    const cursor = this.apiDb.getSmartContractsCursor({ afterBlockHeight });
    for await (const rows of cursor) {
      for (const row of rows) {
        if (this.importInterrupted) {
          // We've received a SIGINT, so stop the import and throw an error so we don't proceed with
          // booting the rest of the service.
          throw new SmartContractImportInterruptedError();
        }
        await this.doImportSmartContract(row);
      }
    }
    console.info(`BlockchainImporter smart contract import finished`);
  }

  protected async doImportSmartContract(contract: BlockchainDbSmartContract): Promise<void> {
    const sip = getSmartContractSip(contract.abi as ClarityAbi);
    if (!sip) {
      return; // Not a token contract.
    }
    await this.db.insertAndEnqueueSmartContract({
      values: {
        principal: contract.contract_id,
        sip: sip,
        abi: JSON.stringify(contract.abi),
        tx_id: contract.tx_id,
        block_height: contract.block_height,
      },
    });
    console.info(`BlockchainImporter detected token contract (${sip}): ${contract.contract_id}`);
  }
}

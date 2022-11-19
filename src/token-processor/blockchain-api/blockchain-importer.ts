import { ClarityAbi } from '@stacks/transactions';
import {
  BlockchainDbSmartContract,
  PgBlockchainApiStore,
} from '../../pg/blockchain-api/pg-blockchain-api-store';
import { PgStore } from '../../pg/pg-store';
import { isPgConnectionError } from '../../pg/postgres-tools/errors';
import { timeout } from '../../pg/postgres-tools/helpers';
import {
  getContractLogMetadataUpdateNotification,
  getSmartContractSip,
} from '../util/sip-validation';

/**
 * Imports token contracts and SIP-019 token metadata update notifications from the Stacks
 * Blockchain API database.
 */
export class BlockchainImporter {
  private readonly db: PgStore;
  private readonly apiDb: PgBlockchainApiStore;

  constructor(args: { db: PgStore; apiDb: PgBlockchainApiStore }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
  }

  async import() {
    let importFinished = false;
    while (!importFinished) {
      try {
        const afterBlockHeight = (await this.db.getSmartContractsMaxBlockHeight()) ?? 1;
        await this.importSmartContracts(afterBlockHeight);
        // If this is not the initial import, we should get all the token metadata update notifications
        // that happened while we were away so we may refresh tokens from contracts that we had already
        // imported before.
        if (afterBlockHeight > 1) {
          // await this.importTokenMetadataUpdateNotifications(afterBlockHeight);
        }
        importFinished = true;
      } catch (error) {
        if (isPgConnectionError(error)) {
          console.error(
            `BlockchainImporter encountered a PG connection error during import, retrying...`,
            error
          );
          await timeout(100);
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

  /**
   * Scans the `contract_logs` table on the Stacks Blockchain API database looking for SIP-019
   * notifications we might have missed since the last service run. If found, enqueue those tokens
   * for processing.
   * @param afterBlockHeight - Minimum block height
   */
  private async importTokenMetadataUpdateNotifications(afterBlockHeight: number) {
    console.info(
      `BlockchainImporter token metadata notification import starting at block height ${afterBlockHeight}`
    );
    const cursor = this.apiDb.getContractLogsCursor({ afterBlockHeight });
    for await (const rows of cursor) {
      for (const row of rows) {
        const notification = getContractLogMetadataUpdateNotification(row);
        if (!notification) {
          continue; // Not a valid SIP-019 notification.
        }
        console.info(
          `BlockchainImporter detected metadata update notification for: ${notification.contract_id}`
        );
        try {
          await this.db.enqueueTokenMetadataUpdateNotification({ notification });
        } catch (error) {
          console.error(`BlockchainImporter unable to update metadata from notification`, error);
        }
      }
    }
    console.info(`BlockchainImporter token metadata notification import finished`);
  }
}

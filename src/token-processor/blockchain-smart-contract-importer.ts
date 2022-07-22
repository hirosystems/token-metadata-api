import { ClarityAbi } from '@stacks/transactions';
import { PgBlockchainApiStore } from "../pg/blockchain-api/pg-blockchain-api-store";
import { PgStore } from "../pg/pg-store";
import { getSmartContractSip } from './util/sip-validation';

/**
 * Scans the `smart_contracts` table in the Stacks Blockchain API postgres DB for every smart
 * contract that exists in the blockchain. It then takes all of them which declare tokens and
 * enqueues them for processing.
 */
export class BlockchainSmartContractImporter {
  private readonly db: PgStore;
  private readonly apiDb: PgBlockchainApiStore;

  constructor(args: {
    db: PgStore,
    apiDb: PgBlockchainApiStore
  }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
  }

  async importSmartContracts() {
    // There could be thousands of contracts. We'll use a cursor to iterate.
    const cursor = await this.apiDb.getSmartContractsCursor({ afterBlockHeight: 1 });
    for await (const rows of cursor) {
      for (const row of rows) {
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
            block_height: row.block_height
          }
        });
        console.info(`BlockchainSmartContractImporter detected (${sip}): ${row.contract_id}`);
      }
    }
  }
}

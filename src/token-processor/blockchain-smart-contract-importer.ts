import { ClarityAbi } from '@stacks/transactions';
import { BlockchainDbSmartContract, PgBlockchainApiStore } from "../pg/blockchain-api/pg-blockchain-api-store";
import { PgStore } from "../pg/pg-store";
import { DbSipNumber } from "../pg/types";
import { JobQueue } from './queue/job-queue';
import { getSmartContractSip } from './util/sip-validation';

/**
 * Scans the `smart_contracts` table in the Stacks Blockchain API postgres DB for every smart
 * contract that exists in the blockchain. It then takes all of them which declare tokens and
 * enqueues them for processing.
 */
export class BlockchainSmartContractImporter {
  private readonly db: PgStore;
  private readonly apiDb: PgBlockchainApiStore;
  private readonly jobQueue: JobQueue;

  constructor(args: {
    db: PgStore,
    apiDb: PgBlockchainApiStore,
    jobQueue: JobQueue
  }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
    this.jobQueue = args.jobQueue;
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
        await this.enqueueSmartContract(row, sip);
        console.info(`BlockchainSmartContractImporter adding (${sip}): ${row.contract_id}`);
      }
    }
  }

  private async enqueueSmartContract(
    blockchainContract: BlockchainDbSmartContract,
    sip: DbSipNumber
  ) {
    const job = await this.db.insertAndEnqueueSmartContract({
      values: {
        principal: blockchainContract.contract_id,
        sip: sip,
        abi: JSON.stringify(blockchainContract.abi),
        tx_id: blockchainContract.tx_id,
        block_height: blockchainContract.block_height
      }
    });
    // this.jobQueue.add(job);
  }
}

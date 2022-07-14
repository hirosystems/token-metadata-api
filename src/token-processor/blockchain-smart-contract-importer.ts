import { ChainID, ClarityAbi } from '@stacks/transactions';
import { BlockchainDbSmartContract, PgBlockchainApiStore } from "../pg/blockchain-api/pg-blockchain-api-store";
import { PgStore } from "../pg/pg-store";
import { DbSipNumber, DbSmartContract } from "../pg/types";
import { SmartContractQueue } from './queue/smart-contract-queue';
import { getSmartContractSip } from './util/sip-validation';

export class BlockchainSmartContractImporter {
  private readonly db: PgStore;
  private readonly apiDb: PgBlockchainApiStore;
  private readonly smartContractQueue: SmartContractQueue;
  private readonly chainId: ChainID;

  constructor(args: {
    db: PgStore,
    apiDb: PgBlockchainApiStore,
    smartContractQueue: SmartContractQueue,
    chainId: ChainID
  }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
    this.smartContractQueue = args.smartContractQueue;
    this.chainId = args.chainId;
  }

  async importSmartContracts() {
    const cursor = await this.apiDb.getSmartContractsCursor({ afterBlockHeight: 1 });
    for await (const [row] of cursor) {
      const sip = getSmartContractSip(row.abi as ClarityAbi);
      if (!sip) {
        continue; // Not a token contract.
      }
      const smartContract = await this.insertSmartContract(row, sip);
      await this.enqueueSmartContract(smartContract);
      console.info(`Importing token contract (${sip}): ${row.contract_id}`);
    }
  }

  private async insertSmartContract(blockchainContract: BlockchainDbSmartContract, sip: DbSipNumber) {
    return await this.db.insertSmartContract({
      values: {
        name: blockchainContract.contract_id,
        sip: sip,
        abi: JSON.stringify(blockchainContract.abi),
        tx_id: blockchainContract.tx_id,
        block_height: blockchainContract.block_height
      }
    });
  }

  private async enqueueSmartContract(smartContract: DbSmartContract) {
    const entry = await this.db.insertSmartContractQueueEntry({
      values: {
        smart_contract_id: smartContract.id
      }
    });
    this.smartContractQueue.add(entry);
  }
}

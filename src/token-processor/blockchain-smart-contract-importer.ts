import { ChainID, ClarityAbi } from "@stacks/transactions";
import { BlockchainDbSmartContract, PgBlockchainApiStore } from "../pg/blockchain-api/pg-blockchain-api-store";
import { PgStore } from "../pg/pg-store";
import { DbSipNumber, DbSmartContract } from "../pg/types";
import { TokenContractHandler } from "./token-processor";
import { getSmartContractSip } from "./util/sip-validation";

export class BlockchainSmartContractImporter {
  readonly pgStore: PgStore;
  readonly pgBlockchainStore: PgBlockchainApiStore;
  readonly chainId: ChainID;

  constructor(args: {
    pgStore: PgStore,
    pgBlockchainStore: PgBlockchainApiStore,
    chainId: ChainID
  }) {
    this.pgStore = args.pgStore;
    this.pgBlockchainStore = args.pgBlockchainStore;
    this.chainId = args.chainId;
  }

  async importSmartContracts() {
    const cursor = await this.pgBlockchainStore.getSmartContractsCursor({ afterBlockHeight: 1 });
    for await (const [row] of cursor) {
      const sip = getSmartContractSip(row.abi as ClarityAbi);
      if (!sip) {
        continue;
      }
      const smartContract = await this.insertSmartContract(row, sip);
      console.info(`Detected smart contract: ${row.contract_id} compliant to ${sip}`);
      await this.enqueueSmartContract(smartContract);
      // try {
      //   const handler = new TokenContractHandler({
      //     contractId: row.contract_id,
      //     smartContractAbi: row.abi as ClarityAbi,
      //     datastore: this.pgStore,
      //     chainId: this.chainId,
      //     txId: row.tx_id,
      //   });
      //   handler.start();
      // } catch (error) {
      //   //
      // }
      // handler.start();
      // console.log(row.contract_id);
    }
  }

  private async insertSmartContract(blockchainContract: BlockchainDbSmartContract, sip: DbSipNumber) {
    return await this.pgStore.insertSmartContract({
      name: blockchainContract.contract_id,
      sip: sip,
      abi: JSON.stringify(blockchainContract.abi),
      tx_id: blockchainContract.tx_id,
      block_height: blockchainContract.block_height
    });
  }

  private async enqueueSmartContract(smartContract: DbSmartContract) {
    //
  }
}

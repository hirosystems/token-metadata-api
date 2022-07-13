import { PgStore } from "../pg/pg-store";
import { DbSipNumber, DbSmartContract } from "../pg/types";

class SmartContractProcessor {
  readonly smartContract: DbSmartContract;
  readonly pgStore: PgStore;

  constructor(args: { pgStore: PgStore; smartContract: DbSmartContract }) {
    this.pgStore = args.pgStore;
    this.smartContract = args.smartContract;
  }

  async process() {
    let queueEntry = await this.pgStore.getSmartContractQueueEntry({ smartContractId: this.smartContract.id });
    // if (queueEntry.)
    switch (this.smartContract.sip) {
      case DbSipNumber.sip009:
        // get total tokens, push all
        break;
      case DbSipNumber.sip010:
        // push immediately to token queue
        break;
      case DbSipNumber.sip013:
        // TODO: Here
        break;
    }
    if (!this.smartContract.token_count) {
      //
    }
  }
}

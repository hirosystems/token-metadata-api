import { PgStore } from "../pg/pg-store";
import { DbQueueEntryStatus, DbSipNumber, DbSmartContract, DbSmartContractQueueEntry } from "../pg/types";
import { TokenQueue } from "./queue/token-queue";
import { dbSipNumberToDbTokenType } from "./util/helpers";

export class SmartContractProcessor {
  private readonly db: PgStore;
  private readonly queueEntry: DbSmartContractQueueEntry;
  private readonly tokenQueue: TokenQueue;

  constructor(args: {
    db: PgStore;
    queueEntry: DbSmartContractQueueEntry;
    tokenQueue: TokenQueue
  }) {
    this.db = args.db;
    this.queueEntry = args.queueEntry;
    this.tokenQueue = args.tokenQueue;
  }

  async process() {
    if (this.queueEntry.status === DbQueueEntryStatus.ready) {
      return;
    }
    const contract = await this.db.getSmartContract({ id: this.queueEntry.smart_contract_id });
    if (!contract) {
      return;
    }
    switch (contract.sip) {
      case DbSipNumber.sip009:
        // get total tokens, push all
        break;

      case DbSipNumber.sip010:
        // FT contracts only have 1 token to process. Do that immediately.
        await this.db.updateSmartContractTokenCount({ id: contract.id, count: 1 });
        await this.enqueueToken(contract, 1);
        break;

      case DbSipNumber.sip013:
        // TODO: Here
        break;
    }
  }

  private async enqueueToken(contract: DbSmartContract, tokenNumber: number) {
    const { token, queueEntry } = await this.db.insertAndEnqueueToken({
      values: {
        smart_contract_id: contract.id,
        token_number: tokenNumber,
        type: dbSipNumberToDbTokenType(contract.sip)
      }
    });
    this.tokenQueue.add(queueEntry);
  }
}

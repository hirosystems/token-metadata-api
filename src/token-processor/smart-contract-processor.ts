import { getAddressFromPrivateKey, makeRandomPrivKey, TransactionVersion } from "@stacks/transactions";
import { PgStore } from "../pg/pg-store";
import { DbQueueEntryStatus, DbSipNumber, DbSmartContract, DbSmartContractQueueEntry } from "../pg/types";
import { TokenQueue } from "./queue/token-queue";
import { StacksNodeRpcClient } from "./stacks-node/stacks-node-rpc-client";
import { RetryableTokenMetadataError } from "./util/errors";
import { dbSipNumberToDbTokenType } from "./util/helpers";

/**
 * Takes a smart contract and (depending on its SIP) enqueues all of its underlying tokens for
 * metadata retrieval. Used by `SmartContractQueue`.
 */
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
        // NFT contracts expose their token count in `get-last-token-id`. We'll get that number
        // through a contract call and then queue that same number of tokens for metadata retrieval.
        const tokenCount = await this.getNftContractLastTokenId(contract);
        await this.enqueueTokens(contract, Number(tokenCount));
        break;

      case DbSipNumber.sip010:
        // FT contracts only have 1 token to process. Do that immediately.
        await this.enqueueTokens(contract, 1);
        break;

      case DbSipNumber.sip013:
        // TODO: Here
        break;
    }
  }

  private async getNftContractLastTokenId(contract: DbSmartContract): Promise<bigint> {
    const key = makeRandomPrivKey();
    const senderAddress = getAddressFromPrivateKey(key.data, TransactionVersion.Mainnet);
    const client = new StacksNodeRpcClient({
      contractPrincipal: contract.principal,
      senderAddress: senderAddress
    });
    try {
      return await client.readUIntFromContract('get-last-token-id') ?? 0n;
    } catch (error) {
      if (error instanceof RetryableTokenMetadataError) {
        // FIXME: Catch retryable errors
      }
      throw error;
    }
  }

  private async enqueueTokens(contract: DbSmartContract, tokenCount: number): Promise<void> {
    await this.db.updateSmartContractTokenCount({ id: contract.id, count: tokenCount });
    if (tokenCount === 0) {
      return;
    }
    console.info(
      `SmartContractProcessor enqueueing ${tokenCount} tokens for ${contract.sip} ${contract.principal}`
    );
    const cursor = await this.db.getInsertAndEnqueueTokensCursor({
      smart_contract_id: contract.id,
      token_count: tokenCount,
      type: dbSipNumberToDbTokenType(contract.sip)
    });
    for await (const [queueEntry] of cursor) {
      this.tokenQueue.add(queueEntry);
    }
  }
}

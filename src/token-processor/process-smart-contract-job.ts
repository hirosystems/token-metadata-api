import {
  getAddressFromPrivateKey,
  makeRandomPrivKey,
  TransactionVersion,
} from '@stacks/transactions';
import { logger } from '../logger';
import { DbSipNumber, DbSmartContract } from '../pg/types';
import { Job } from './queue/job';
import { StacksNodeRpcClient } from './stacks-node/stacks-node-rpc-client';
import { dbSipNumberToDbTokenType } from './util/helpers';

/**
 * Takes a smart contract and (depending on its SIP) enqueues all of its underlying tokens for
 * metadata retrieval.
 */
export class ProcessSmartContractJob extends Job {
  private contract?: DbSmartContract;

  protected async handler(): Promise<void> {
    if (!this.job.smart_contract_id) {
      return;
    }
    const contract = await this.db.getSmartContract({ id: this.job.smart_contract_id });
    if (!contract) {
      return;
    }
    this.contract = contract;
    switch (contract.sip) {
      case DbSipNumber.sip009:
        // NFT contracts expose their token count in `get-last-token-id`. We'll get that number
        // through a contract call and then queue that same number of tokens for metadata retrieval.
        const tokenCount = await this.getNftContractLastTokenId(contract);
        if (tokenCount) {
          await this.enqueueTokens(contract, Number(tokenCount));
        }
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

  description(): string {
    return this.contract
      ? `Smart Contact (${this.contract.sip}, ${this.contract.principal})`
      : `ProcessSmartContractJob`;
  }

  private async getNftContractLastTokenId(contract: DbSmartContract): Promise<bigint | undefined> {
    const key = makeRandomPrivKey();
    const senderAddress = getAddressFromPrivateKey(key.data, TransactionVersion.Mainnet);
    const client = new StacksNodeRpcClient({
      contractPrincipal: contract.principal,
      senderAddress: senderAddress,
    });
    return await client.readUIntFromContract('get-last-token-id');
  }

  private async enqueueTokens(contract: DbSmartContract, tokenCount: number): Promise<void> {
    if (tokenCount === 0) {
      return;
    }
    await this.db.updateSmartContractTokenCount({ id: contract.id, count: tokenCount });
    logger.info(
      `ProcessSmartContractJob enqueueing ${tokenCount} tokens for ${this.description()}`
    );
    const cursor = this.db.getInsertAndEnqueueTokensCursor({
      smart_contract_id: contract.id,
      token_count: tokenCount,
      type: dbSipNumberToDbTokenType(contract.sip),
    });
    for await (const jobs of cursor) {
      // Enqueue.
    }
  }
}

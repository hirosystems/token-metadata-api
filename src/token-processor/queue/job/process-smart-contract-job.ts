import { ENV } from '../../../env';
import { logger } from '../../../logger';
import { DbJob, DbSipNumber, DbSmartContract, DbTokenInsert, DbTokenType } from '../../../pg/types';
import { Job } from './job';
import { StacksNodeRpcClient } from '../../stacks-node/stacks-node-rpc-client';
import { dbSipNumberToDbTokenType } from '../../util/helpers';
import { PgBlockchainApiStore } from '../../../pg/blockchain-api/pg-blockchain-api-store';
import { PgStore } from '../../../pg/pg-store';
import { getContractLogSftMintEvent } from '../../util/sip-validation';
import { makeRandomPrivKey, getAddressFromPrivateKey } from '@stacks/transactions';
import { TransactionVersion } from 'stacks-encoding-native-js';

/**
 * Takes a smart contract and (depending on its SIP) enqueues all of its underlying tokens for
 * metadata retrieval.
 */
export class ProcessSmartContractJob extends Job {
  private contract?: DbSmartContract;
  private readonly apiDb: PgBlockchainApiStore;

  constructor(args: { db: PgStore; apiDb: PgBlockchainApiStore; job: DbJob }) {
    super(args);
    this.apiDb = args.apiDb;
  }

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
          await this.enqueueTokens(contract, tokenCount);
        }
        break;

      case DbSipNumber.sip010:
        // FT contracts only have 1 token to process. Do that immediately.
        await this.enqueueTokens(contract, 1n);
        break;

      case DbSipNumber.sip013:
        // SFT contracts need to check the blockchain API DB to determine valid token IDs.
        await this.enqueueSftContractTokenIds(contract);
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

  private async enqueueSftContractTokenIds(contract: DbSmartContract): Promise<void> {
    // Scan for `sft_mint` events emitted by the SFT contract.
    const cursor = this.apiDb.getSmartContractLogsByContractCursor({
      contractId: contract.principal,
    });
    const tokenNumbers = new Set<string>();
    for await (const rows of cursor) {
      for (const row of rows) {
        const event = getContractLogSftMintEvent(row);
        if (!event) {
          continue;
        }
        tokenNumbers.add(event.tokenId.toString());
      }
    }
    const tokenInserts: DbTokenInsert[] = [...tokenNumbers].map(n => ({
      smart_contract_id: contract.id,
      type: DbTokenType.sft,
      token_number: n,
    }));
    if (tokenInserts.length) {
      await this.db.insertAndEnqueueTokenArray(tokenInserts);
    }
  }

  private async enqueueTokens(contract: DbSmartContract, tokenCount: bigint): Promise<void> {
    if (tokenCount === 0n) {
      return;
    }
    if (tokenCount > ENV.METADATA_MAX_NFT_CONTRACT_TOKEN_COUNT) {
      logger.warn(
        `ProcessSmartContractJob max token count exceeded for ${this.description()}: ${tokenCount}`
      );
      return;
    }
    await this.db.updateSmartContractTokenCount({ id: contract.id, count: tokenCount });
    logger.info(
      `ProcessSmartContractJob enqueueing ${tokenCount} tokens for ${this.description()}`
    );
    await this.db.insertAndEnqueueSequentialTokens({
      smart_contract_id: contract.id,
      token_count: tokenCount,
      type: dbSipNumberToDbTokenType(contract.sip),
    });
  }
}

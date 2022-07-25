import {
  getAddressFromPrivateKey,
  makeRandomPrivKey,
  TransactionVersion,
  uintCV,
} from '@stacks/transactions';
import {
  getTokenMetadataProcessingMode,
  stopwatch,
} from './util/helpers';
import { StacksNodeRpcClient } from './stacks-node/stacks-node-rpc-client';
import {
  DbJobStatus,
  DbTokenType,
  DbToken,
  DbSmartContract,
  DbProcessedTokenUpdateBundle,
  DbMetadataLocaleInsertBundle,
} from '../pg/types';
import { RetryableTokenMetadataError } from './util/errors';
import { Job } from './queue/job';
import { TokenMetadataProcessingMode } from './queue/job-queue';
import { ENV } from '../util/env';
import { fetchAllMetadataLocalesFromBaseUri, getTokenSpecificUri } from './util/metadata-parsers';

/**
 * Downloads, parses and indexes metadata info for a single token in the Stacks blockchain by
 * calling read-only functions its smart contracts owner. Processes FTs, NFTs and SFTs. Used by
 * `TokenQueue`.
 */
export class ProcessTokenJob extends Job {
  async work() {
    if (this.job.status !== DbJobStatus.pending || !this.job.token_id) {
      return;
    }
    const sw = stopwatch();
    const token = await this.db.getToken({ id: this.job.token_id });
    if (!token) {
      throw Error(`ProcessTokenJob token not found with id ${this.job.token_id}`);
    }
    const contract = await this.db.getSmartContract({ id: token.smart_contract_id });
    if (!contract) {
      throw Error(`ProcessTokenJob contract not found with id ${token.smart_contract_id}`);
    }

    // This try/catch block will catch any and all errors that are generated while processing metadata
    // (contract call errors, parse errors, timeouts, etc.). Fortunately, each of them were previously tagged
    // as retryable or not retryable so we'll make a decision here about what to do in each case.
    // If we choose to retry, this queue entry will simply not be marked as `processed = true` so it can be
    // picked up by the `TokensProcessorQueue` at a later time.
    let processingFinished = false;
    let finishedWithError = false;
    try {
      const randomPrivKey = makeRandomPrivKey();
      const senderAddress = getAddressFromPrivateKey(
        randomPrivKey.data,
        TransactionVersion.Mainnet
      );
      const client = new StacksNodeRpcClient({
        contractPrincipal: contract.principal,
        senderAddress: senderAddress
      });
      console.info(`ProcessTokenJob processing ${this.tokenDescription(token, contract)}`);
      switch (token.type) {
        case DbTokenType.ft:
          await this.handleFt(client, token);
          break;
        case DbTokenType.nft:
          await this.handleNft(client, token);
          break;
        case DbTokenType.sft:
          // TODO: Here
          break;
      }
      processingFinished = true;
    } catch (error) {
      if (error instanceof RetryableTokenMetadataError) {
        const retries = await this.db.increaseJobRetryCount({
          id: this.job.id
        });
        if (
          getTokenMetadataProcessingMode() === TokenMetadataProcessingMode.strict ||
          retries <= ENV.METADATA_MAX_RETRIES
        ) {
          console.info(
            `ProcessTokenJob a recoverable error happened while processing ${this.tokenDescription(token, contract)}, trying again later: ${error}`
          );
          await this.db.updateJobStatus({ id: this.job.id, status: DbJobStatus.pending });
        } else {
          console.warn(
            `ProcessTokenJob max retries reached while processing ${this.tokenDescription(token, contract)}, giving up: ${error}`
          );
          processingFinished = true;
          finishedWithError = true;
        }
      } else {
        // Something more serious happened, mark this token as failed.
        console.error(`ProcessTokenJob error processing ${this.tokenDescription(token, contract)}: ${error}`);
        processingFinished = true;
        finishedWithError = true;
      }
    } finally {
      if (processingFinished) {
        await this.db.updateJobStatus({
          id: this.job.id,
          status: finishedWithError ? DbJobStatus.failed : DbJobStatus.done
        });
        console.info(
          `ProcessTokenJob finished processing ${this.tokenDescription(token, contract)} in ${sw.getElapsed()}ms`
        );
      }
    }
  }

  private tokenDescription(token: DbToken, contract: DbSmartContract): string {
    switch (token.type) {
      case DbTokenType.ft:
        return `FT ${contract.principal} (id=${token.id})`;
      case DbTokenType.nft:
        return `NFT ${contract.principal}#${token.token_number} (id=${token.id})`;
      case DbTokenType.sft:
        return `SFT ${contract.principal}#${token.token_number} (id=${token.id})`;
    }
  }

  private async handleFt(client: StacksNodeRpcClient, token: DbToken) {
    const name = await client.readStringFromContract('get-name');
    const uri = await client.readStringFromContract('get-token-uri');
    const symbol = await client.readStringFromContract('get-symbol');

    let fDecimals: number | undefined;
    const decimals = await client.readUIntFromContract('get-decimals');
    if (decimals) {
      fDecimals = Number(decimals.toString());
    }

    let fTotalSupply: number | undefined;
    const totalSupply = await client.readUIntFromContract('get-total-supply');
    if (totalSupply) {
      fTotalSupply = Number(totalSupply.toString());
    }

    let metadataLocales: DbMetadataLocaleInsertBundle[] | undefined;
    if (uri) {
      metadataLocales = await fetchAllMetadataLocalesFromBaseUri(uri, token);
    }

    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        name: name ?? null,
        symbol: symbol ?? null,
        decimals: fDecimals ?? null,
        total_supply: fTotalSupply ?? null,
        uri: uri ? getTokenSpecificUri(uri, token.token_number) : null
      },
      metadataLocales: metadataLocales
    };
    await this.db.updateProcessedTokenWithMetadata({ id: token.id, values: tokenValues });
  }

  private async handleNft(client: StacksNodeRpcClient, token: DbToken) {
    const uri = await client.readStringFromContract('get-token-uri', [uintCV(token.token_number)]);
    let metadataLocales: DbMetadataLocaleInsertBundle[] | undefined;
    if (uri) {
      metadataLocales = await fetchAllMetadataLocalesFromBaseUri(uri, token);
    }

    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        uri: uri ? getTokenSpecificUri(uri, token.token_number) : null
      },
      metadataLocales: metadataLocales
    };
    await this.db.updateProcessedTokenWithMetadata({ id: token.id, values: tokenValues });
  }
}

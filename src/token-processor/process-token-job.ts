import {
  getAddressFromPrivateKey,
  makeRandomPrivKey,
  TransactionVersion,
} from '@stacks/transactions';
import * as querystring from 'querystring';
import {
  getFetchableUrl,
  getTokenMetadataProcessingMode,
  parseDataUrl,
  stopwatch,
} from './util/helpers';
import { StacksNodeRpcClient } from './stacks-node/stacks-node-rpc-client';
import { request } from 'undici';
import { DbJobStatus, DbTokenType, DbFtInsert, DbNftInsert, DbToken, DbSmartContract } from '../pg/types';
import { ENV } from '..';
import { RetryableTokenMetadataError } from './util/errors';
import { Job } from './queue/job';

// FIXME: Move somewhere else
export enum TokenMetadataProcessingMode {
  /** If a recoverable processing error occurs, we'll try again until the max retry attempt is reached. See `.env` */
  default,
  /** If a recoverable processing error occurs, we'll try again indefinitely. */
  strict,
}

/**
 * Downloads, parses and indexes metadata info for a single token in the Stacks blockchain by
 * calling read-only functions its smart contracts owner. Processes FTs, NFTs and SFTs. Used by
 * `TokenQueue`.
 */
export class ProcessTokenJob extends Job {
  async work() {
    if (this.job.status !== DbJobStatus.waiting || !this.job.token_id) {
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
          await this.handleFt(client, this.job.token_id);
          break;
        case DbTokenType.nft:
          await this.handleNft(client, this.job.token_id);
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

  private async handleFt(client: StacksNodeRpcClient, tokenId: number) {
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

    // let metadata: FtTokenMetadata | undefined;
    // if (contractCallUri) {
    //   try {
    //     metadata = await this.getMetadataFromUri(contractCallUri);
    //   } catch (error) {
    //     // An unavailable external service failed to provide reasonable data (images, etc.).
    //     // We will ignore these and fill out the remaining SIP-compliant metadata.
    //     console.warn(
    //       `[token-metadata] ft metadata fetch error while processing ${this.contractId}: ${error}`
    //     );
    //   }
    // }
    // let imgUrl: string | undefined;
    // if (metadata?.imageUri) {
    //   const normalizedUrl = this.getImageUrl(metadata.imageUri);
    //   imgUrl = await this.processImageUrl(normalizedUrl);
    // }

    // FIXME: Should we write NULLs?
    const tokenValues: DbFtInsert = {
      name: name ?? '',
      symbol: symbol ?? '',
      decimals: fDecimals ?? 0,
      total_supply: fTotalSupply ?? 0,
      uri: uri ?? ''
    };
    await this.db.updateToken({ id: tokenId, values: tokenValues });
  }

  private async handleNft(client: StacksNodeRpcClient, tokenId: number) {
    const uri = await client.readStringFromContract('get-token-uri');

    // let metadata: NftTokenMetadata | undefined;
    // const contractCallUri = await this.readStringFromContract('get-token-uri', [uintCV(0)]);
    // if (contractCallUri) {
    //   try {
    //     metadata = await this.getMetadataFromUri<NftTokenMetadata>(contractCallUri);
    //     metadata = this.patchTokenMetadataImageUri(metadata);
    //   } catch (error) {
    //     // An unavailable external service failed to provide reasonable data (images, etc.).
    //     // We will ignore these and fill out the remaining SIP-compliant metadata.
    //     console.warn(
    //       `[token-metadata] nft metadata fetch error while processing ${this.contractId}: ${error}`
    //     );
    //   }
    // }
    // let imgUrl: string | undefined;
    // if (metadata?.imageUri) {
    //   const normalizedUrl = this.getImageUrl(metadata.imageUri);
    //   imgUrl = await this.processImageUrl(normalizedUrl);
    // }

    // FIXME: Should we write NULLs?
    const tokenValues: DbNftInsert = {
      uri: uri ?? ''
    };
    await this.db.updateToken({ id: tokenId, values: tokenValues });
  }

  private getImageUrl(uri: string): string {
    // Support images embedded in a Data URL
    if (new URL(uri).protocol === 'data:') {
      // const dataUrl = ParseDataUrl(uri);
      const dataUrl = parseDataUrl(uri);
      if (!dataUrl) {
        throw new Error(`Data URL could not be parsed: ${uri}`);
      }
      if (!dataUrl.mediaType?.startsWith('image/')) {
        throw new Error(`Token image is a Data URL with a non-image media type: ${uri}`);
      }
      return uri;
    }
    const fetchableUrl = getFetchableUrl(uri);
    return fetchableUrl.toString();
  }

  private async getMetadataFromUri<Type>(token_uri: string): Promise<Type> {
    // Support JSON embedded in a Data URL
    if (new URL(token_uri).protocol === 'data:') {
      const dataUrl = parseDataUrl(token_uri);
      if (!dataUrl) {
        throw new Error(`Data URL could not be parsed: ${token_uri}`);
      }
      let content: string;
      // If media type is omitted it should default to percent-encoded `text/plain;charset=US-ASCII`
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs#syntax
      // If media type is specified but without base64 then encoding is ambiguous, so check for
      // percent-encoding or assume a literal string compatible with utf8. Because we're expecting
      // a JSON object we can reliable check for a leading `%` char, otherwise assume unescaped JSON.
      if (dataUrl.base64) {
        content = Buffer.from(dataUrl.data, 'base64').toString('utf8');
      } else if (dataUrl.data.startsWith('%')) {
        content = querystring.unescape(dataUrl.data);
      } else {
        content = dataUrl.data;
      }
      try {
        return JSON.parse(content) as Type;
      } catch (error) {
        throw new Error(`Data URL could not be parsed as JSON: ${token_uri}`);
      }
    }
    const httpUrl = getFetchableUrl(token_uri);

    let fetchImmediateRetryCount = 0;
    let result: Type | undefined;
    // We'll try to fetch metadata and give it `METADATA_MAX_IMMEDIATE_URI_RETRIES` attempts
    // for the external service to return a reasonable response, otherwise we'll consider the
    // metadata as dead.
    do {
      try {
        const networkResult = await request(httpUrl.toString(), {
          method: 'GET',
          bodyTimeout: ENV.METADATA_FETCH_TIMEOUT_MS
        });
        result = await networkResult.body.json();
        // result = await performFetch(httpUrl.toString(), {
        //   timeoutMs: getTokenMetadataFetchTimeoutMs(),
        //   maxResponseBytes: METADATA_MAX_PAYLOAD_BYTE_SIZE,
        // });
        break;
      } catch (error) {
        fetchImmediateRetryCount++;
        if (
          // (error instanceof FetchError && error.type === 'max-size') ||
          fetchImmediateRetryCount >= ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES
        ) {
          throw error;
        }
      }
    } while (fetchImmediateRetryCount < ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES);
    if (result) {
      return result;
    }
    throw new Error(`Unable to fetch metadata from ${token_uri}`);
  }
}

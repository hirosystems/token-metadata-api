import {
  ChainID,
  ClarityAbi,
  ClarityType,
  ClarityValue,
  getAddressFromPrivateKey,
  hexToCV,
  makeRandomPrivKey,
  TransactionVersion,
  uintCV,
  UIntCV,
} from '@stacks/transactions';
import * as querystring from 'querystring';
import {
  getFetchableUrl,
  getTokenMetadataProcessingMode,
  parseDataUrl,
  stopwatch,
} from './util/helpers';
import { ReadOnlyContractCallResponse, StacksNodeRpcClient } from './stacks-node/stacks-node-rpc-client';
import { PgStore } from '../pg/pg-store';
import { request } from 'undici';
import { DbSipNumber, DbQueueEntryStatus, DbTokenQueueEntry, DbTokenType } from '../pg/types';
import { getSmartContractSip } from './util/sip-validation';
import { ENV } from '..';
import { RetryableTokenMetadataError } from './util/errors';

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
export class TokenProcessor {
  private readonly db: PgStore;
  private readonly queueEntry: DbTokenQueueEntry;

  constructor(args: {
    db: PgStore,
    queueEntry: DbTokenQueueEntry
  }) {
    this.db = args.db;
    this.queueEntry = args.queueEntry;
  }

  async process() {
    // console.info(
    //   `[token-metadata] found ${this.tokenKind} compliant contract ${this.contractId} in tx ${this.txId}, begin retrieving metadata...`
    // );
    const sw = stopwatch();
    const token = await this.db.getToken({ id: this.queueEntry.token_id });
    if (!token) {
      throw Error(`TokenProcessor token not found with id ${this.queueEntry.token_id}`);
    }
    const contract = await this.db.getSmartContract({ id: token.smart_contract_id });
    if (!contract) {
      throw Error(`TokenProcessor contract not found with id ${token.smart_contract_id}`);
    }

    // This try/catch block will catch any and all errors that are generated while processing metadata
    // (contract call errors, parse errors, timeouts, etc.). Fortunately, each of them were previously tagged
    // as retryable or not retryable so we'll make a decision here about what to do in each case.
    // If we choose to retry, this queue entry will simply not be marked as `processed = true` so it can be
    // picked up by the `TokensProcessorQueue` at a later time.
    let processingFinished = false;
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
      switch (token.type) {
        case DbTokenType.ft:
          await this.handleFt(client);
          break;
        case DbTokenType.nft:
          await this.handleNft(client);
          break;
        case DbTokenType.sft:
          // TODO: Here
          break;
      }
      processingFinished = true;
    } catch (error) {
      if (error instanceof RetryableTokenMetadataError) {
        const retries = await this.db.increaseTokenQueueEntryRetryCount({
          id: this.queueEntry.id
        });
        if (
          getTokenMetadataProcessingMode() === TokenMetadataProcessingMode.strict ||
          retries <= ENV.METADATA_MAX_RETRIES
        ) {
          console.info(
            `TokenProcessor a recoverable error happened while processing token ${token.id}, trying again later: ${error}`
          );
        } else {
          console.warn(
            `TokenProcessor max retries reached while processing token ${token.id}, giving up: ${error}`
          );
          processingFinished = true;
        }
      } else {
        // Something more serious happened, mark this token as done.
        processingFinished = true;
      }
    } finally {
      if (processingFinished) {
        // FIXME: Ready with error
        await this.db.updateTokenQueueEntryStatus({ id: this.queueEntry.id, status: DbQueueEntryStatus.ready });
        console.info(
          `TokenProcessor finished processing token ${token.id} in ${sw.getElapsed()} ms`
        );
      }
    }
  }

  /**
   * fetch Fungible contract metadata
   */
  private async handleFt(client: StacksNodeRpcClient) {
    const contractCallName = await client.readStringFromContract('get-name');
    const contractCallUri = await client.readStringFromContract('get-token-uri');
    const contractCallSymbol = await client.readStringFromContract('get-symbol');

    let contractCallDecimals: number | undefined;
    const decimalsResult = await client.readUIntFromContract('get-decimals');
    if (decimalsResult) {
      contractCallDecimals = Number(decimalsResult.toString());
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

    // const fungibleTokenMetadata: DbFungibleTokenMetadata = {
    //   token_uri: contractCallUri ?? '',
    //   name: contractCallName ?? metadata?.name ?? '', // prefer the on-chain name
    //   description: metadata?.description ?? '',
    //   image_uri: imgUrl ?? '',
    //   image_canonical_uri: metadata?.imageUri ?? '',
    //   symbol: contractCallSymbol ?? '',
    //   decimals: contractCallDecimals ?? 0,
    //   contract_id: this.contractId,
    //   tx_id: this.txId,
    //   sender_address: this.contractAddress,
    // };
    // await this.db.updateFtMetadata(fungibleTokenMetadata, this.dbQueueId);
  }

  /**
   * fetch Non Fungible contract metadata
   */
  private async handleNft(client: StacksNodeRpcClient) {
    // TODO: This is incorrectly attempting to fetch the metadata for a specific
    // NFT and applying it to the entire NFT type/contract. A new SIP needs created
    // to define how generic metadata for an NFT type/contract should be retrieved.
    // In the meantime, this will often fail or result in weird data, but at least
    // the NFT type enumeration endpoints will have data like the contract ID and txid.

    // TODO: this should instead use the SIP-012 draft https://github.com/stacksgov/sips/pull/18
    // function `(get-nft-meta () (response (optional {name: (string-uft8 30), image: (string-ascii 255)}) uint))`

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

    // const nonFungibleTokenMetadata: DbNonFungibleTokenMetadata = {
    //   token_uri: contractCallUri ?? '',
    //   name: metadata?.name ?? '',
    //   description: metadata?.description ?? '',
    //   image_uri: imgUrl ?? '',
    //   image_canonical_uri: metadata?.imageUri ?? '',
    //   contract_id: `${this.contractId}`,
    //   tx_id: this.txId,
    //   sender_address: this.contractAddress,
    // };
    // await this.db.updateNFtMetadata(nonFungibleTokenMetadata, this.dbQueueId);
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

  /**
   * Fetch metadata from uri
   */
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

import { cvToHex, getAddressFromPrivateKey, makeRandomPrivKey, uintCV } from '@stacks/transactions';
import {
  ClarityValueUInt,
  decodeClarityValueToRepr,
  TransactionVersion,
} from 'stacks-encoding-native-js';
import { ENV } from '../../../env';
import {
  DbMetadataLocaleInsertBundle,
  DbProcessedTokenUpdateBundle,
  DbSmartContract,
  DbToken,
  DbTokenType,
} from '../../../pg/types';
import { StacksNodeRpcClient } from '../../stacks-node/stacks-node-rpc-client';
import { TooManyRequestsHttpError } from '../../util/errors';
import {
  fetchAllMetadataLocalesFromBaseUri,
  getFetchableUrl,
  getTokenSpecificUri,
} from '../../util/metadata-helpers';
import { RetryableJobError } from '../errors';
import { Job } from './job';
import { PgNumeric, logger } from '@hirosystems/api-toolkit';

/**
 * Downloads, parses and indexes metadata info for a single token in the Stacks blockchain by
 * calling read-only functions its smart contracts owner. Processes FTs, NFTs and SFTs. Used by
 * `TokenQueue`.
 */
export class ProcessTokenJob extends Job {
  private token?: DbToken;
  private contract?: DbSmartContract;

  async handler(): Promise<void> {
    const tokenId = this.job.token_id;
    if (!tokenId) {
      return;
    }
    const [token, contract] = await this.db.sqlTransaction(async sql => {
      const token = await this.db.getToken({ id: tokenId });
      if (!token) {
        logger.warn(`ProcessTokenJob token not found id=${tokenId}`);
        return [undefined, undefined];
      }
      const contract = await this.db.getSmartContract({ id: token.smart_contract_id });
      if (!contract) {
        logger.warn(`ProcessTokenJob contract not found id=${token.smart_contract_id}`);
        return [token, undefined];
      }
      return [token, contract];
    });
    this.token = token;
    this.contract = contract;
    if (!token || !contract) return;

    const client = StacksNodeRpcClient.create({
      contractPrincipal: contract.principal,
    });
    logger.info(`ProcessTokenJob processing ${this.description()}`);
    try {
      switch (token.type) {
        case DbTokenType.ft:
          await this.handleFt(client, token);
          break;
        case DbTokenType.nft:
          await this.handleNft(client, token);
          break;
        case DbTokenType.sft:
          await this.handleSft(client, token);
          break;
      }
    } catch (error) {
      // If we got rate limited, save this host so we can skip further calls even from jobs for
      // other tokens.
      if (error instanceof RetryableJobError && error.cause instanceof TooManyRequestsHttpError) {
        await this.saveRateLimitedHost(error.cause);
      }
      throw error;
    }
  }

  description(): string {
    if (!this.token || !this.contract) {
      return 'ProcessTokenJob';
    }
    switch (this.token.type) {
      case DbTokenType.ft:
        return `FT ${this.contract.principal} (id=${this.token.id})`;
      case DbTokenType.nft:
        return `NFT ${this.contract.principal}#${this.token.token_number} (id=${this.token.id})`;
      case DbTokenType.sft:
        return `SFT ${this.contract.principal}#${this.token.token_number} (id=${this.token.id})`;
    }
  }

  private async handleFt(client: StacksNodeRpcClient, token: DbToken) {
    const uri = await this.getTokenUri(client);
    const name = await client.readStringFromContract('get-name');
    const symbol = await client.readStringFromContract('get-symbol');

    let fDecimals: number | undefined;
    const decimals = await client.readUIntFromContract('get-decimals');
    if (decimals) {
      fDecimals = Number(decimals.toString());
    }

    let fTotalSupply: PgNumeric | undefined;
    const totalSupply = await client.readUIntFromContract('get-total-supply');
    if (totalSupply) {
      fTotalSupply = totalSupply.toString();
    }

    let metadataLocales: DbMetadataLocaleInsertBundle[] | undefined;
    if (uri) {
      try {
        metadataLocales = await fetchAllMetadataLocalesFromBaseUri(uri, token);
      } catch (error) {
        // If the fetch error is retryable, rethrow for job retry. If it's not but we don't have any
        // data to display otherwise, rethrow so we can mark the job as failed/invalid.
        if (error instanceof RetryableJobError || !(name || symbol || fDecimals || fTotalSupply)) {
          throw error;
        }
        logger.warn(
          error,
          `ProcessTokenJob ${this.description()} metadata fetch failed for ${uri}, continuing with contract data`
        );
      }
    }

    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        name: name ?? null,
        symbol: symbol ?? null,
        decimals: fDecimals ?? null,
        total_supply: fTotalSupply ?? null,
        uri: uri ? getTokenSpecificUri(uri, token.token_number) : null,
      },
      metadataLocales: metadataLocales,
    };
    await this.db.updateProcessedTokenWithMetadata({ id: token.id, values: tokenValues });
  }

  private async handleNft(client: StacksNodeRpcClient, token: DbToken) {
    const uri = await this.getTokenUri(client, token.token_number);
    let metadataLocales: DbMetadataLocaleInsertBundle[] | undefined;
    if (uri) {
      metadataLocales = await fetchAllMetadataLocalesFromBaseUri(uri, token);
    }

    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        uri: uri ? getTokenSpecificUri(uri, token.token_number) : null,
      },
      metadataLocales: metadataLocales,
    };
    await this.db.updateProcessedTokenWithMetadata({ id: token.id, values: tokenValues });
  }

  private async handleSft(client: StacksNodeRpcClient, token: DbToken) {
    const uri = await this.getTokenUri(client, token.token_number);
    const arg = [this.uIntCv(token.token_number)];

    let fDecimals: number | undefined;
    const decimals = await client.readUIntFromContract('get-decimals', arg);
    if (decimals) {
      fDecimals = Number(decimals.toString());
    }

    let fTotalSupply: PgNumeric | undefined;
    const totalSupply = await client.readUIntFromContract('get-total-supply', arg);
    if (totalSupply) {
      fTotalSupply = totalSupply.toString();
    }

    let metadataLocales: DbMetadataLocaleInsertBundle[] | undefined;
    if (uri) {
      metadataLocales = await fetchAllMetadataLocalesFromBaseUri(uri, token);
    }

    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        uri: uri ? getTokenSpecificUri(uri, token.token_number) : null,
        decimals: fDecimals ?? null,
        total_supply: fTotalSupply ?? null,
      },
      metadataLocales: metadataLocales,
    };
    await this.db.updateProcessedTokenWithMetadata({ id: token.id, values: tokenValues });
  }

  private async saveRateLimitedHost(error: TooManyRequestsHttpError) {
    const hostname = error.url.hostname;
    const retryAfter = error.retryAfter ?? ENV.METADATA_RATE_LIMITED_HOST_RETRY_AFTER;
    logger.info(`ProcessTokenJob saving rate limited host ${hostname}, retry after ${retryAfter}s`);
    await this.db.insertRateLimitedHost({ values: { hostname, retry_after: retryAfter } });
  }

  private async getTokenUri(
    client: StacksNodeRpcClient,
    tokenNumber?: bigint
  ): Promise<string | undefined> {
    const uri = await client.readStringFromContract(
      'get-token-uri',
      tokenNumber ? [this.uIntCv(tokenNumber)] : undefined
    );
    if (!uri) {
      return;
    }
    // Before we return the uri, check if its fetchable hostname is not already rate limited.
    const fetchable = getFetchableUrl(uri);
    const rateLimitedHost = await this.db.getRateLimitedHost({ hostname: fetchable.hostname });
    if (rateLimitedHost) {
      const retryAfter = Date.parse(rateLimitedHost.retry_after);
      const now = Date.now();
      if (retryAfter <= now) {
        // Retry-After has passed, we can proceed.
        await this.db.deleteRateLimitedHost({ hostname: fetchable.hostname });
        logger.info(
          `ProcessTokenJob Retry-After has passed for rate limited hostname ${fetchable.hostname}, resuming fetches`
        );
        return uri;
      } else {
        throw new RetryableJobError(
          `ProcessTokenJob skipping fetch to rate-limited hostname ${fetchable.hostname}`
        );
      }
    } else {
      return uri;
    }
  }

  private uIntCv(n: bigint): ClarityValueUInt {
    const cv = uintCV(n);
    const hex = cvToHex(cv);
    return {
      value: n.toString(),
      hex: hex,
      repr: decodeClarityValueToRepr(hex),
    } as ClarityValueUInt;
  }
}

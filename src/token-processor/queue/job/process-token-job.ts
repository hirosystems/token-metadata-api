import { cvToHex, getAddressFromPrivateKey, makeRandomPrivKey, uintCV } from '@stacks/transactions';
import {
  ClarityValueUInt,
  decodeClarityValueToRepr,
  TransactionVersion,
} from 'stacks-encoding-native-js';
import { logger } from '../../../logger';
import { PgNumeric } from '../../../pg/postgres-tools/types';
import {
  DbMetadataLocaleInsertBundle,
  DbProcessedTokenUpdateBundle,
  DbSmartContract,
  DbToken,
  DbTokenType,
} from '../../../pg/types';
import { StacksNodeRpcClient } from '../../stacks-node/stacks-node-rpc-client';
import {
  fetchAllMetadataLocalesFromBaseUri,
  getTokenSpecificUri,
} from '../../util/metadata-helpers';
import { Job } from './job';

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
        throw Error(`ProcessTokenJob token not found with id ${tokenId}`);
      }
      const contract = await this.db.getSmartContract({ id: token.smart_contract_id });
      if (!contract) {
        throw Error(`ProcessTokenJob contract not found with id ${token.smart_contract_id}`);
      }
      return [token, contract];
    });
    this.token = token;
    this.contract = contract;

    const randomPrivKey = makeRandomPrivKey();
    const senderAddress = getAddressFromPrivateKey(randomPrivKey.data, TransactionVersion.Mainnet);
    const client = new StacksNodeRpcClient({
      contractPrincipal: contract.principal,
      senderAddress: senderAddress,
    });
    logger.info(`ProcessTokenJob processing ${this.description()}`);
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
    const name = await client.readStringFromContract('get-name');
    const uri = await client.readStringFromContract('get-token-uri');
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
      metadataLocales = await fetchAllMetadataLocalesFromBaseUri(uri, token);
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
    const uri = await client.readStringFromContract('get-token-uri', [
      this.uIntCv(token.token_number),
    ]);
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
    const arg = [this.uIntCv(token.token_number)];

    const uri = await client.readStringFromContract('get-token-uri', arg);

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

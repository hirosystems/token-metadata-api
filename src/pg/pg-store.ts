import * as ley from 'ley';
import { TokenMetadataUpdateNotification } from '../token-processor/util/sip-validation';
import { ENV } from '../env';
import {
  DbSmartContract,
  DbSmartContractInsert,
  DbJobStatus,
  DbTokenInsert,
  DbJob,
  DbToken,
  DbTokenType,
  DbProcessedTokenUpdateBundle,
  DbTokenMetadataLocaleBundle,
  DbMetadata,
  DbMetadataAttribute,
  DbMetadataProperty,
  DbMetadataLocaleBundle,
} from './types';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';

/**
 * Connects and queries the Token Metadata Service's local postgres DB.
 */
export class PgStore extends BasePgStore {
  static async connect(opts?: { skipMigrations: boolean }): Promise<PgStore> {
    const pgConfig = {
      host: ENV.PGHOST,
      port: ENV.PGPORT,
      user: ENV.PGUSER,
      password: ENV.PGPASSWORD,
      database: ENV.PGDATABASE,
    };
    const sql = await connectPostgres({
      usageName: 'tms-pg-store',
      connectionArgs: pgConfig,
      connectionConfig: {
        poolMax: 25,
      },
    });
    if (opts?.skipMigrations !== true) {
      await ley.up({
        dir: 'migrations',
        driver: 'postgres',
        config: pgConfig,
      });
    }
    return new PgStore(sql);
  }

  async insertAndEnqueueSmartContract(args: { values: DbSmartContractInsert }): Promise<DbJob> {
    const result = await this.sql<DbJob[]>`
      WITH smart_contract_inserts AS (
        INSERT INTO smart_contracts ${this.sql(args.values)}
        ON CONFLICT ON CONSTRAINT smart_contracts_principal_unique DO UPDATE SET updated_at = NOW()
        RETURNING id
      )
      INSERT INTO jobs (smart_contract_id)
        (SELECT id AS smart_contract_id FROM smart_contract_inserts)
      ON CONFLICT (smart_contract_id) WHERE token_id IS NULL DO
        UPDATE SET updated_at = NOW(), status = 'pending'
      RETURNING *
    `;
    return result[0];
  }

  async getSmartContract(args: { id: number }): Promise<DbSmartContract | undefined> {
    const result = await this.sql<DbSmartContract[]>`
      SELECT * FROM smart_contracts WHERE id = ${args.id}
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
  }

  /**
   * Retrieves the latest block height of imported contracts. Useful for when we want to only import
   * remaining contracts from the Stacks chain.
   * @returns Max block height
   */
  async getSmartContractsMaxBlockHeight(): Promise<number | undefined> {
    const result = await this.sql<{ max: number }[]>`
      SELECT MAX(block_height) FROM smart_contracts;
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0].max;
  }

  async updateSmartContractTokenCount(args: { id: number; count: number }): Promise<void> {
    await this.sql`
      UPDATE smart_contracts SET token_count = ${args.count} WHERE id = ${args.id}
    `;
  }

  /**
   * Returns a cursor that inserts new tokens and new token queue entries until `token_count` items
   * are created. A cursor is preferred because `token_count` could be in the tens of thousands.
   * @param smart_contract_id - smart contract id
   * @param token_count - how many tokens to insert
   * @param type - token type (ft, nft, sft)
   * @returns `DbTokenQueueEntry` cursor
   */
  getInsertAndEnqueueTokensCursor(args: {
    smart_contract_id: number;
    token_count: number;
    type: DbTokenType;
  }): AsyncIterable<DbJob[]> {
    const tokenValues: DbTokenInsert[] = [];
    for (let index = 1; index <= args.token_count; index++) {
      tokenValues.push({
        smart_contract_id: args.smart_contract_id,
        token_number: index,
        type: args.type,
      });
    }
    return this.getInsertAndEnqueueTokensCursorInternal(tokenValues);
  }

  async getToken(args: { id: number }): Promise<DbToken | undefined> {
    const result = await this.sql<DbToken[]>`
      SELECT * FROM tokens WHERE id = ${args.id}
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
  }

  async getFtMetadataBundle(args: {
    contractPrincipal: string;
    locale?: string;
  }): Promise<DbTokenMetadataLocaleBundle | undefined> {
    return await this.sqlTransaction(async sql => {
      const tokenIdRes = await sql<{ id: number }[]>`
        SELECT tokens.id FROM tokens
        INNER JOIN smart_contracts ON tokens.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
          AND tokens.updated_at IS NOT NULL
      `;
      if (tokenIdRes.count === 0) {
        return undefined;
      }
      if (args.locale && !(await this.isTokenLocaleAvailable(tokenIdRes[0].id, args.locale))) {
        return undefined;
      }
      return await this.getTokenMetadataBundle(tokenIdRes[0].id, args.locale);
    });
  }

  async getNftMetadataBundle(args: {
    contractPrincipal: string;
    tokenNumber: number;
    locale?: string;
  }): Promise<DbTokenMetadataLocaleBundle | undefined> {
    return await this.sqlTransaction(async sql => {
      const tokenIdRes = await sql<{ id: number }[]>`
        SELECT tokens.id
        FROM tokens
        INNER JOIN smart_contracts ON tokens.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
          AND tokens.token_number = ${args.tokenNumber}
          AND tokens.updated_at IS NOT NULL
      `;
      if (tokenIdRes.count === 0) {
        return undefined;
      }
      if (args.locale && !(await this.isTokenLocaleAvailable(tokenIdRes[0].id, args.locale))) {
        return undefined;
      }
      return await this.getTokenMetadataBundle(tokenIdRes[0].id, args.locale);
    });
  }

  /**
   * Writes a full bundle of token info and metadata (including attributes and properties) into the
   * db.
   * @param id - token id
   * @param values - update bundle values
   */
  async updateProcessedTokenWithMetadata(args: {
    id: number;
    values: DbProcessedTokenUpdateBundle;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // Update token and clear old metadata (this will cascade into all properties and attributes)
      await sql`
        UPDATE tokens SET ${sql(args.values.token)}, updated_at = NOW() WHERE id = ${args.id}
      `;
      await sql`DELETE FROM metadata WHERE token_id = ${args.id}`;
      // Write new metadata
      if (args.values.metadataLocales && args.values.metadataLocales.length > 0) {
        for (const locale of args.values.metadataLocales) {
          const metadataInsert = await sql<{ id: number }[]>`
            INSERT INTO metadata ${sql(locale.metadata)} RETURNING id
          `;
          const metadataId = metadataInsert[0].id;
          if (locale.attributes && locale.attributes.length > 0) {
            const values = locale.attributes.map(attribute => ({
              ...attribute,
              metadata_id: metadataId,
            }));
            await sql`INSERT INTO metadata_attributes ${sql(values)}`;
          }
          if (locale.properties && locale.properties.length > 0) {
            const values = locale.properties.map(property => ({
              ...property,
              metadata_id: metadataId,
            }));
            await sql`INSERT INTO metadata_properties ${sql(values)}`;
          }
        }
      }
    });
  }

  async updateJobStatus(args: { id: number; status: DbJobStatus }): Promise<void> {
    await this.sql`
      UPDATE jobs
      SET status = ${args.status}
      WHERE id = ${args.id}
    `;
  }

  async increaseJobRetryCount(args: { id: number }): Promise<number> {
    const result = await this.sql<{ retry_count: number }[]>`
      UPDATE jobs
      SET retry_count = retry_count + 1
      WHERE id = ${args.id}
      RETURNING retry_count
    `;
    return result[0].retry_count;
  }

  /**
   * Retrieves a number of queued jobs so they can be processed immediately.
   * @param limit - number of jobs to retrieve
   * @returns `DbJob[]`
   */
  async getPendingJobBatch(args: { limit: number }): Promise<DbJob[]> {
    return this.sql<DbJob[]>`
      SELECT * FROM jobs
      WHERE status = 'pending'
      ORDER BY COALESCE(updated_at, created_at) ASC
      LIMIT ${args.limit}
    `;
  }

  /**
   * Gets jobs marked as `queued` in the database.
   * @returns `DbJob[]`
   */
  async getQueuedJobs(): Promise<DbJob[]> {
    return this.sql<DbJob[]>`
      SELECT * FROM jobs
      WHERE status = 'queued'
      ORDER BY updated_at ASC
    `;
  }

  async getJob(args: { id: number }): Promise<DbJob | undefined> {
    const result = await this.sql<DbJob[]>`SELECT * FROM jobs WHERE id = ${args.id}`;
    if (result.count) {
      return result[0];
    }
  }

  /**
   * Enqueues the tokens specified by a SIP-019 notification for metadata refresh. Depending on the
   * token type and notification parameters, this will refresh specific tokens or complete
   * contracts. See SIP-019 for more info.
   * @param notification - SIP-019 notification
   */
  async enqueueTokenMetadataUpdateNotification(args: {
    notification: TokenMetadataUpdateNotification;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      // First, make sure we have the specified contract.
      const contractResult = await sql<{ id: number }[]>`
        SELECT id FROM smart_contracts WHERE principal = ${args.notification.contract_id}
      `;
      if (contractResult.count === 0) {
        throw new Error(`Contract not found with principal: ${args.notification.contract_id}`);
      }
      const contractId = contractResult[0].id;

      if (args.notification.token_class === 'nft') {
        if (!args.notification.token_ids) {
          // If this is an NFT update and no token ids were specified, simply re-queue the complete
          // contract to refresh all tokens.
          await sql`
            UPDATE jobs
            SET status = 'pending', updated_at = NOW()
            WHERE smart_contract_id = ${contractId}
          `;
        } else {
          // FIXME: Enqueue each specified token id otherwise.
          const insertValues: DbTokenInsert[] = args.notification.token_ids.map(i => ({
            smart_contract_id: contractId,
            token_number: i,
            type: DbTokenType.nft,
          }));
          this.getInsertAndEnqueueTokensCursorInternal(insertValues);
        }
      } else if (args.notification.token_class === 'ft') {
        // FIXME: Enqueue the only token for FTs.
        this.getInsertAndEnqueueTokensCursorInternal([
          {
            smart_contract_id: contractId,
            token_number: 1,
            type: DbTokenType.ft,
          },
        ]);
      }
    });
  }

  /**
   * Returns a token ETag based on its last updated date.
   * @param contractPrincipal - smart contract principal
   * @param tokenNumber - token number
   * @returns ETag
   */
  async getTokenEtag(args: {
    contractPrincipal: string;
    tokenNumber: number;
  }): Promise<string | undefined> {
    const result = await this.sql<{ etag: string }[]>`
      SELECT date_part('epoch', t.updated_at)::text AS etag
      FROM tokens AS t
      INNER JOIN smart_contracts AS s ON s.id = t.smart_contract_id
      WHERE s.principal = ${args.contractPrincipal}
      AND t.token_number = ${args.tokenNumber}
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0].etag;
  }

  async getJobStatusCounts(): Promise<{ count: number; status: string }[]> {
    return this.sql<{ count: number; status: string }[]>`
      SELECT COUNT(*)::int, status FROM jobs GROUP BY status
    `;
  }

  async getSmartContractCounts(): Promise<{ count: number; sip: string }[]> {
    return this.sql<{ count: number; sip: string }[]>`
      SELECT COUNT(*)::int, sip FROM smart_contracts GROUP BY sip
    `;
  }

  async getTokenCounts(): Promise<{ count: number; type: string }[]> {
    return this.sql<{ count: number; type: string }[]>`
      SELECT COUNT(*)::int, type FROM tokens GROUP BY type
    `;
  }

  private getInsertAndEnqueueTokensCursorInternal(
    tokenValues: DbTokenInsert[]
  ): AsyncIterable<DbJob[]> {
    return this.sql<DbJob[]>`
      WITH token_inserts AS (
        INSERT INTO tokens ${this.sql(tokenValues)}
        ON CONFLICT ON CONSTRAINT tokens_smart_contract_id_token_number_unique DO
          UPDATE SET
            uri = EXCLUDED.uri,
            name = EXCLUDED.name,
            symbol = EXCLUDED.symbol,
            decimals = EXCLUDED.decimals,
            total_supply = EXCLUDED.total_supply,
            updated_at = NOW()
        RETURNING id
      )
      INSERT INTO jobs (token_id) (SELECT id AS token_id FROM token_inserts)
      ON CONFLICT (token_id) WHERE smart_contract_id IS NULL DO
        UPDATE SET updated_at = NOW(), status = 'pending'
      RETURNING *
    `.cursor();
  }

  private async isTokenLocaleAvailable(tokenId: number, locale: string): Promise<boolean> {
    const tokenLocale = await this.sql<{ id: number }[]>`
      SELECT id FROM metadata
      WHERE token_id = ${tokenId}
      AND l10n_locale = ${locale}
    `;
    return tokenLocale.count !== 0;
  }

  private async getTokenMetadataBundle(
    tokenId: number,
    locale?: string
  ): Promise<DbTokenMetadataLocaleBundle | undefined> {
    const tokenRes = await this.sql<DbToken[]>`
      SELECT * FROM tokens WHERE id = ${tokenId}
    `;
    if (tokenRes.count === 0) {
      return undefined;
    }
    const token = tokenRes[0];
    if (!token.updated_at) {
      // No updated date means this token hasn't been processed once.
      return undefined;
    }
    let localeBundle: DbMetadataLocaleBundle | undefined;
    const metadataRes = await this.sql<DbMetadata[]>`
      SELECT * FROM metadata
      WHERE token_id = ${token.id}
      AND ${locale ? this.sql`l10n_locale = ${locale}` : this.sql`l10n_default = TRUE`}
    `;
    if (metadataRes.count > 0) {
      const attributes = await this.sql<DbMetadataAttribute[]>`
        SELECT * FROM metadata_attributes WHERE metadata_id = ${metadataRes[0].id}
      `;
      const properties = await this.sql<DbMetadataProperty[]>`
        SELECT * FROM metadata_properties WHERE metadata_id = ${metadataRes[0].id}
      `;
      localeBundle = {
        metadata: metadataRes[0],
        attributes: attributes,
        properties: properties,
      };
    }
    return {
      token: token,
      metadataLocale: localeBundle,
    };
  }
}

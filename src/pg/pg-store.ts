import * as postgres from 'postgres';
import { ENV } from '../util/env';
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
  DbMetadataProperty
} from './types';

/**
 * Connects and queries the Token Metadata Service's local postgres DB.
 */
export class PgStore {
  readonly sql: postgres.Sql<any>;

  constructor() {
    this.sql = postgres({
      host: ENV.PGHOST,
      port: ENV.PGPORT,
      user: ENV.PGUSER,
      password: ENV.PGPASSWORD,
      database: ENV.PGDATABASE
    });
  }

  async close() {
    await this.sql.end();
  }

  async insertAndEnqueueSmartContract(args: {
    values: DbSmartContractInsert
  }): Promise<DbJob> {
    const values = {
      ...args.values,
      created_at: this.sql`now()`,
      updated_at: this.sql`now()`
    };
    const result = await this.sql<DbJob[]>`
      WITH smart_contract_inserts AS (
        INSERT INTO smart_contracts ${this.sql(values)}
        ON CONFLICT ON CONSTRAINT smart_contracts_principal_unique DO
          UPDATE SET updated_at = EXCLUDED.updated_at
        RETURNING id
      )
      INSERT INTO jobs (smart_contract_id, created_at, updated_at)
        (
          SELECT id AS smart_contract_id, NOW() AS created_at, NOW() AS updated_at
          FROM smart_contract_inserts
        )
      ON CONFLICT ON CONSTRAINT jobs_token_id_smart_contract_id_unique DO
        UPDATE SET updated_at = EXCLUDED.updated_at
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
   * missing contracts from the Stacks chain.
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
   * @param smart_contract_id smart contract id
   * @param token_count how many tokens to insert
   * @param type token type (ft, nft, sft)
   * @returns `DbTokenQueueEntry` cursor
   */
  async getInsertAndEnqueueTokensCursor(args: {
    smart_contract_id: number;
    token_count: number;
    type: DbTokenType;
  }): Promise<AsyncIterable<DbJob[]>> {
    let tokenValues: DbTokenInsert[] = [];
    for (let index = 1; index <= args.token_count; index++) {
      tokenValues.push({
        smart_contract_id: args.smart_contract_id,
        token_number: index,
        type: args.type,
      });
    }
    return this.sql<DbJob[]>`
      WITH token_inserts AS (
        INSERT INTO tokens ${this.sql(tokenValues)}
        ON CONFLICT ON CONSTRAINT tokens_smart_contract_id_token_number_unique DO NOTHING
        RETURNING id
      )
      INSERT INTO jobs (token_id, created_at, updated_at)
        (SELECT id AS token_id, NOW() AS created_at, NOW() AS updated_at FROM token_inserts)
      ON CONFLICT ON CONSTRAINT jobs_token_id_smart_contract_id_unique DO
        UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `.cursor();
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
    contractPrincipal: string,
    locale?: string,
  }): Promise<DbTokenMetadataLocaleBundle | undefined> {
    return await this.sql.begin(async sql => {
      const tokenId = await sql<{ id: number }[]>`
        SELECT id FROM tokens
        INNER JOIN smart_contracts ON tokens.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
      `;
      if (tokenId.count === 0) {
        return undefined;
      }
      return await this.getTokenMetadataBundle(sql, tokenId[0].id, args.locale);
    });
  }

  async getNftMetadataBundle(args: {
    contractPrincipal: string,
    tokenNumber: number,
    locale?: string,
  }): Promise<DbTokenMetadataLocaleBundle | undefined> {
    return await this.sql.begin(async sql => {
      const tokenId = await sql<{ id: number }[]>`
        SELECT tokens.id
        FROM tokens
        INNER JOIN smart_contracts ON tokens.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
          AND tokens.token_number = ${args.tokenNumber}
      `;
      if (tokenId.count === 0) {
        return undefined;
      }
      return await this.getTokenMetadataBundle(sql, tokenId[0].id, args.locale);
    });
  }

  /**
   * Writes a full bundle of token info and metadata (including attributes and properties) into the
   * db.
   * @param id token id
   * @param values update bundle values
   */
  async updateProcessedTokenWithMetadata(args: {
    id: number;
    values: DbProcessedTokenUpdateBundle
  }): Promise<void> {
    await this.sql.begin(async sql => {
      await sql`
        UPDATE tokens SET ${sql(args.values.token)} WHERE id = ${args.id}
      `;
      for (const locale of args.values.metadataLocales ?? []) {
        const metadataInsert = await sql<{ id: number }[]>`
          INSERT INTO metadata ${sql(locale.metadata)} RETURNING id
        `;
        const metadataId = metadataInsert[0].id;
        if (locale.attributes && locale.attributes.length > 0) {
          const values = locale.attributes.map(attribute => ({
            ...attribute,
            metadata_id: metadataId
          }));
          await sql`INSERT INTO metadata_attributes ${sql(values)}`;
        }
        if (locale.properties && locale.properties.length > 0) {
          const values = locale.properties.map(property => ({
            ...property,
            metadata_id: metadataId
          }));
          await sql`INSERT INTO metadata_properties ${sql(values)}`;
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
   * @param limit number of jobs to retrieve
   * @returns `DbJob[]`
   */
  async getPendingJobBatch(args: { limit: number }): Promise<DbJob[]> {
    return this.sql<DbJob[]>`
      SELECT * FROM jobs
      WHERE status = 'pending'
      ORDER BY updated_at ASC
      LIMIT ${args.limit}
    `;
  }

  private async getTokenMetadataBundle(
    sql: postgres.TransactionSql<any>,
    tokenId: number,
    locale?: string,
  ): Promise<DbTokenMetadataLocaleBundle | undefined> {
    const token = await sql<DbToken[]>`
      SELECT * FROM tokens WHERE id = ${tokenId}
    `;
    if (token.count === 0) {
      return undefined;
    }
    const metadata = await sql<DbMetadata[]>`
      SELECT * FROM metadata
      WHERE token_id = ${token[0].id}
      AND ${locale ? sql`l10n_locale = ${locale}` : sql`l10n_default = TRUE`}
    `;
    let attributes: DbMetadataAttribute[] = [];
    let properties: DbMetadataProperty[] = [];
    if (metadata.count > 0) {
      attributes = await sql<DbMetadataAttribute[]>`
        SELECT * FROM metadata_attributes WHERE metadata_id = ${metadata[0].id}
      `;
      properties = await sql<DbMetadataProperty[]>`
        SELECT * FROM metadata_properties WHERE metadata_id = ${metadata[0].id}
      `;
    }
    return {
      token: token[0],
      metadataLocale: {
        metadata: metadata[0],
        attributes: attributes,
        properties: properties,
      }
    };
  }
}

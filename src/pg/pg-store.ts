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
  DbTokenUpdateMode,
  SMART_CONTRACTS_COLUMNS,
  TOKENS_COLUMNS,
  JOBS_COLUMNS,
  METADATA_COLUMNS,
  METADATA_ATTRIBUTES_COLUMNS,
  METADATA_PROPERTIES_COLUMNS,
  DbRateLimitedHostInsert,
  DbRateLimitedHost,
  RATE_LIMITED_HOSTS_COLUMNS,
  DbIndexPaging,
  DbFungibleTokenFilters,
  DbFungibleTokenMetadataItem,
  DbPaginatedResult,
  DbFungibleTokenOrder,
} from './types';
import { connectPostgres } from './postgres-tools';
import { BasePgStore } from './postgres-tools/base-pg-store';
import {
  ContractNotFoundError,
  InvalidContractError,
  InvalidTokenError,
  TokenLocaleNotFoundError,
  TokenNotFoundError,
  TokenNotProcessedError,
} from './errors';
import { runMigrations } from './migrations';
import { FtOrderBy, Order } from '../api/schemas';

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
        poolMax: ENV.PG_CONNECTION_POOL_MAX,
        idleTimeout: ENV.PG_IDLE_TIMEOUT,
        maxLifetime: ENV.PG_MAX_LIFETIME,
      },
    });
    if (opts?.skipMigrations !== true) {
      await runMigrations('up');
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

  async getSmartContract(
    args: { id: number } | { principal: string }
  ): Promise<DbSmartContract | undefined> {
    const result = await this.sql<DbSmartContract[]>`
      SELECT ${this.sql(SMART_CONTRACTS_COLUMNS)}
      FROM smart_contracts
      WHERE ${'id' in args ? this.sql`id = ${args.id}` : this.sql`principal = ${args.principal}`}
    `;
    if (result.count === 0) {
      return undefined;
    }
    return result[0];
  }

  async updateSmartContractTokenCount(args: { id: number; count: bigint }): Promise<void> {
    await this.sql`
      UPDATE smart_contracts SET token_count = ${args.count.toString()} WHERE id = ${args.id}
    `;
  }

  /**
   * Returns a cursor that inserts new tokens and new token queue entries until `token_count` items
   * are created, usually used when processing an NFT contract. A cursor is preferred because
   * `token_count` could be in the tens of thousands.
   * @param smart_contract_id - smart contract id
   * @param token_count - how many tokens to insert
   * @param type - token type
   * @returns `DbJob` array for all inserted tokens
   */
  async insertAndEnqueueSequentialTokens(args: {
    smart_contract_id: number;
    token_count: bigint;
    type: DbTokenType;
  }): Promise<DbJob[]> {
    const tokenValues: DbTokenInsert[] = [];
    for (let index = 1; index <= args.token_count; index++) {
      tokenValues.push({
        smart_contract_id: args.smart_contract_id,
        token_number: index.toString(),
        type: args.type,
      });
    }
    return this.insertAndEnqueueTokenArray(tokenValues);
  }

  async getToken(args: { id: number }): Promise<DbToken | undefined> {
    const result = await this.sql<DbToken[]>`
      SELECT ${this.sql(TOKENS_COLUMNS)} FROM tokens WHERE id = ${args.id}
    `;
    if (result.count === 0) {
      return undefined;
    }
    const token = result[0];
    return {
      ...token,
      total_supply: token.total_supply ? BigInt(token.total_supply.toString()) : undefined,
    };
  }

  async getTokenMetadataBundle(args: {
    contractPrincipal: string;
    tokenNumber: number;
    locale?: string;
  }): Promise<DbTokenMetadataLocaleBundle> {
    return await this.sqlTransaction(async sql => {
      // Is the contract invalid?
      const contractJobStatus = await sql<{ status: DbJobStatus }[]>`
        SELECT status
        FROM jobs
        INNER JOIN smart_contracts ON jobs.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
      `;
      if (contractJobStatus.count === 0) {
        throw new ContractNotFoundError();
      }
      if (contractJobStatus[0].status === DbJobStatus.invalid) {
        throw new InvalidContractError();
      }
      // Get token id
      const tokenIdRes = await sql<{ id: number }[]>`
        SELECT tokens.id
        FROM tokens
        INNER JOIN smart_contracts ON tokens.smart_contract_id = smart_contracts.id
        WHERE smart_contracts.principal = ${args.contractPrincipal}
          AND tokens.token_number = ${args.tokenNumber}
      `;
      if (tokenIdRes.count === 0) {
        throw new TokenNotFoundError();
      }
      const tokenId = tokenIdRes[0].id;
      // Is the locale valid?
      if (args.locale && !(await this.isTokenLocaleAvailable(tokenId, args.locale))) {
        throw new TokenLocaleNotFoundError();
      }
      // Get metadata
      return await this.getTokenMetadataBundleInternal(
        tokenId,
        args.contractPrincipal,
        args.locale
      );
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
      SET status = ${args.status}, updated_at = NOW()
      WHERE id = ${args.id}
    `;
  }

  async retryAllFailedJobs(): Promise<void> {
    await this.sql`
      UPDATE jobs
      SET status = ${DbJobStatus.pending}, retry_count = 0, updated_at = NOW()
      WHERE status IN (${DbJobStatus.failed}, ${DbJobStatus.invalid})
    `;
  }

  async increaseJobRetryCount(args: { id: number }): Promise<number> {
    const result = await this.sql<{ retry_count: number }[]>`
      UPDATE jobs
      SET retry_count = retry_count + 1, updated_at = NOW()
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
      SELECT ${this.sql(JOBS_COLUMNS)} FROM jobs
      WHERE status = 'pending'
      ORDER BY COALESCE(updated_at, created_at) ASC
      LIMIT ${args.limit}
    `;
  }

  /**
   * Gets jobs marked as `queued` in the database.
   * @returns `DbJob[]`
   */
  async getQueuedJobs(args: { excludingIds: number[] }): Promise<DbJob[]> {
    return this.sql<DbJob[]>`
      SELECT ${this.sql(JOBS_COLUMNS)} FROM jobs
      WHERE status = 'queued'
      ${
        args.excludingIds.length
          ? this.sql`AND id NOT IN ${this.sql(args.excludingIds)}`
          : this.sql``
      }
      ORDER BY updated_at ASC
    `;
  }

  async getJob(args: { id: number }): Promise<DbJob | undefined> {
    const result = await this.sql<DbJob[]>`
      SELECT ${this.sql(JOBS_COLUMNS)} FROM jobs WHERE id = ${args.id}
    `;
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
        throw new ContractNotFoundError();
      }
      const contractId = contractResult[0].id;

      const refreshTokens = async (tokenIds: bigint[]) => {
        const tokens = await sql<DbToken[]>`
          SELECT ${this.sql(TOKENS_COLUMNS)} FROM tokens
          WHERE smart_contract_id = ${contractId}
          ${tokenIds.length ? sql`AND token_number IN ${sql(tokenIds)}` : sql``}
        `;
        for (const token of tokens) {
          if (token.update_mode === DbTokenUpdateMode.frozen) {
            continue; // Can't refresh frozen tokens.
          }
          // Update token mode.
          await sql`
            UPDATE tokens
            SET update_mode = ${args.notification.update_mode},
              ttl = ${args.notification.ttl ? sql`${args.notification.ttl}` : sql`NULL`}
            WHERE id = ${token.id}
          `;
          // Re-enqueue job.
          await sql`
            UPDATE jobs
            SET status = 'pending', updated_at = NOW()
            WHERE token_id = ${token.id}
          `;
        }
      };

      switch (args.notification.token_class) {
        case 'nft':
          await refreshTokens(args.notification.token_ids ?? []);
          break;
        case 'ft':
          await refreshTokens([1n]);
          break;
      }
    });
  }

  async updateChainTipBlockHeight(args: { blockHeight: number }): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = ${args.blockHeight}`;
  }

  async getChainTipBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  async enqueueDynamicTokensDueForRefresh(): Promise<void> {
    const interval = ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL.toString();
    await this.sql`
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE status IN ('done', 'failed') AND token_id = (
        SELECT id FROM tokens
        WHERE update_mode = 'dynamic'
        AND CASE
          WHEN ttl IS NOT NULL THEN
            COALESCE(updated_at, created_at) < (NOW() - INTERVAL '1 seconds' * ttl)
          ELSE
            COALESCE(updated_at, created_at) < (NOW() - INTERVAL '${this.sql(interval)} seconds')
        END
      )
    `;
  }

  /**
   * Returns a token ETag based on its last updated date.
   * @param contractPrincipal - smart contract principal
   * @param tokenNumber - token number
   * @returns ETag
   */
  async getTokenEtag(args: {
    contractPrincipal: string;
    tokenNumber: bigint;
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

  async insertAndEnqueueTokenArray(tokenValues: DbTokenInsert[]): Promise<DbJob[]> {
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
      RETURNING ${this.sql(JOBS_COLUMNS)}
    `;
  }

  async insertRateLimitedHost(args: {
    values: DbRateLimitedHostInsert;
  }): Promise<DbRateLimitedHost> {
    const retryAfter = args.values.retry_after.toString();
    const results = await this.sql<DbRateLimitedHost[]>`
      INSERT INTO rate_limited_hosts (hostname, created_at, retry_after)
      VALUES (${args.values.hostname}, DEFAULT, NOW() + INTERVAL '${this.sql(retryAfter)} seconds')
      ON CONFLICT ON CONSTRAINT rate_limited_hosts_hostname_unique DO
        UPDATE SET retry_after = EXCLUDED.retry_after
      RETURNING ${this.sql(RATE_LIMITED_HOSTS_COLUMNS)}
    `;
    return results[0];
  }

  async getRateLimitedHost(args: { hostname: string }): Promise<DbRateLimitedHost | undefined> {
    const results = await this.sql<DbRateLimitedHost[]>`
      SELECT ${this.sql(RATE_LIMITED_HOSTS_COLUMNS)}
      FROM rate_limited_hosts
      WHERE hostname = ${args.hostname}
    `;
    if (results.count > 0) {
      return results[0];
    }
  }

  async deleteRateLimitedHost(args: { hostname: string }): Promise<void> {
    await this.sql`
      DELETE FROM rate_limited_hosts WHERE hostname = ${args.hostname}
    `;
  }

  async getFungibleTokens(args: {
    page: DbIndexPaging;
    filters?: DbFungibleTokenFilters;
    order?: DbFungibleTokenOrder;
  }): Promise<DbPaginatedResult<DbFungibleTokenMetadataItem>> {
    return await this.sqlTransaction(async sql => {
      // `ORDER BY` statement
      let orderBy = sql`t.name`;
      switch (args.order?.order_by) {
        case FtOrderBy.name:
          orderBy = sql`t.name`;
          break;
        case FtOrderBy.symbol:
          orderBy = sql`t.symbol`;
          break;
      }
      // `ORDER` statement
      const order = args.order?.order === Order.asc ? sql`ASC` : sql`DESC`;
      const results = await sql<({ total: number } & DbFungibleTokenMetadataItem)[]>`
        SELECT
          t.name,
          t.symbol,
          t.decimals,
          t.total_supply,
          t.uri,
          m.description,
          s.principal,
          s.tx_id,
          m.image,
          m.cached_image,
          COUNT(*) OVER() as total
        FROM tokens AS t
        INNER JOIN metadata AS m ON t.id = m.token_id
        INNER JOIN smart_contracts AS s ON t.smart_contract_id = s.id
        WHERE t.type = 'ft'
          ${args.filters?.name ? sql`AND t.name LIKE ${'%' + args.filters.name + '%'}` : sql``}
          ${args.filters?.symbol ? sql`AND t.symbol = ${args.filters.symbol}` : sql``}
          ${args.filters?.address ? sql`AND s.principal LIKE ${args.filters.address + '%'}` : sql``}
        ORDER BY ${orderBy} ${order}
        LIMIT ${args.page.limit}
        OFFSET ${args.page.offset}
      `;
      return {
        total: results[0].total ?? 0,
        results: results ?? [],
      };
    });
  }

  private async isTokenLocaleAvailable(tokenId: number, locale: string): Promise<boolean> {
    const tokenLocale = await this.sql<{ id: number }[]>`
      SELECT id FROM metadata
      WHERE token_id = ${tokenId}
      AND l10n_locale = ${locale}
    `;
    return tokenLocale.count !== 0;
  }

  private async getTokenMetadataBundleInternal(
    tokenId: number,
    smartContractPrincipal: string,
    locale?: string
  ): Promise<DbTokenMetadataLocaleBundle> {
    // Is token invalid?
    const tokenJobStatus = await this.sql<{ status: string }[]>`
      SELECT status FROM jobs WHERE token_id = ${tokenId}
    `;
    if (tokenJobStatus.count === 0) {
      throw new TokenNotFoundError();
    }
    const status = tokenJobStatus[0].status;
    if (status === DbJobStatus.invalid) {
      throw new InvalidTokenError();
    }
    // Get token
    const tokenRes = await this.sql<DbToken[]>`
      SELECT ${this.sql(TOKENS_COLUMNS)} FROM tokens WHERE id = ${tokenId}
    `;
    const token = tokenRes[0];
    // Is it still waiting to be processed?
    if (!token.updated_at && (status === DbJobStatus.queued || status === DbJobStatus.pending)) {
      throw new TokenNotProcessedError();
    }
    // Get metadata
    let localeBundle: DbMetadataLocaleBundle | undefined;
    const metadataRes = await this.sql<DbMetadata[]>`
      SELECT ${this.sql(METADATA_COLUMNS)} FROM metadata
      WHERE token_id = ${token.id}
      AND ${locale ? this.sql`l10n_locale = ${locale}` : this.sql`l10n_default = TRUE`}
    `;
    if (metadataRes.count > 0) {
      const attributes = await this.sql<DbMetadataAttribute[]>`
        SELECT ${this.sql(
          METADATA_ATTRIBUTES_COLUMNS
        )} FROM metadata_attributes WHERE metadata_id = ${metadataRes[0].id}
      `;
      const properties = await this.sql<DbMetadataProperty[]>`
        SELECT ${this.sql(
          METADATA_PROPERTIES_COLUMNS
        )} FROM metadata_properties WHERE metadata_id = ${metadataRes[0].id}
      `;
      localeBundle = {
        metadata: metadataRes[0],
        attributes: attributes,
        properties: properties,
      };
    }
    const smartContract = await this.getSmartContract({ principal: smartContractPrincipal });
    if (!smartContract) {
      throw new ContractNotFoundError();
    }
    return {
      token,
      smartContract,
      metadataLocale: localeBundle,
    };
  }
}

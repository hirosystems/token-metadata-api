import {
  BasePgStoreModule,
  PgSqlClient,
  batchIterate,
  logger,
  stopwatch,
} from '@hirosystems/api-toolkit';
import { StacksEvent, StacksPayload } from '@hirosystems/chainhook-client';
import { ENV } from '../../env';
import {
  NftMintEvent,
  SftMintEvent,
  SmartContractDeployment,
  TokenMetadataUpdateNotification,
} from '../../token-processor/util/sip-validation';
import { ContractNotFoundError } from '../errors';
import {
  DbJob,
  DbSipNumber,
  DbSmartContractInsert,
  DbTokenInsert,
  DbTokenType,
  DbSmartContract,
} from '../types';
import { BlockCache, CachedEvent } from './block-cache';
import { dbSipNumberToDbTokenType } from '../../token-processor/util/helpers';
import BigNumber from 'bignumber.js';

export class ChainhookPgStore extends BasePgStoreModule {
  async processPayload(payload: StacksPayload): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      for (const block of payload.rollback) {
        logger.info(`ChainhookPgStore rollback block ${block.block_identifier.index}`);
        const time = stopwatch();
        await this.updateStacksBlock(sql, block, 'rollback');
        logger.info(
          `ChainhookPgStore rollback block ${
            block.block_identifier.index
          } finished in ${time.getElapsedSeconds()}s`
        );
      }
      for (const block of payload.apply) {
        if (block.block_identifier.index <= (await this.getLastIngestedBlockHeight())) {
          logger.info(
            `ChainhookPgStore skipping previously ingested block ${block.block_identifier.index}`
          );
          continue;
        }
        logger.info(`ChainhookPgStore apply block ${block.block_identifier.index}`);
        const time = stopwatch();
        await this.updateStacksBlock(sql, block, 'apply');
        await this.enqueueDynamicTokensDueForRefresh();
        await this.updateChainTipBlockHeight(block.block_identifier.index);
        logger.info(
          `ChainhookPgStore apply block ${
            block.block_identifier.index
          } finished in ${time.getElapsedSeconds()}s`
        );
      }
    });
  }

  /**
   * Inserts new tokens and new token queue entries until `token_count` items are created, usually
   * used when processing an NFT contract.
   */
  async insertAndEnqueueSequentialTokens(args: {
    smart_contract: DbSmartContract;
    token_count: bigint;
  }): Promise<void> {
    const tokenValues: DbTokenInsert[] = [];
    for (let index = 1; index <= args.token_count; index++)
      tokenValues.push({
        smart_contract_id: args.smart_contract.id,
        token_number: index.toString(),
        type: dbSipNumberToDbTokenType(args.smart_contract.sip),
        block_height: args.smart_contract.block_height,
        index_block_hash: args.smart_contract.index_block_hash,
        tx_id: args.smart_contract.tx_id,
        tx_index: args.smart_contract.tx_index,
      });
    return this.insertAndEnqueueTokens(tokenValues);
  }

  async applyContractDeployment(
    sql: PgSqlClient,
    contract: CachedEvent<SmartContractDeployment>,
    cache: BlockCache
  ) {
    const values: DbSmartContractInsert = {
      principal: contract.event.principal,
      sip: contract.event.sip,
      block_height: cache.block.index,
      index_block_hash: cache.block.hash,
      tx_id: contract.tx_id,
      tx_index: contract.tx_index,
      fungible_token_name: contract.event.fungible_token_name ?? null,
      non_fungible_token_name: contract.event.non_fungible_token_name ?? null,
    };
    await sql`
      WITH smart_contract_inserts AS (
        INSERT INTO smart_contracts ${sql(values)}
        ON CONFLICT ON CONSTRAINT smart_contracts_principal_key DO UPDATE SET updated_at = NOW()
        RETURNING id
      )
      INSERT INTO jobs (smart_contract_id)
        (SELECT id AS smart_contract_id FROM smart_contract_inserts)
      ON CONFLICT (smart_contract_id) WHERE token_id IS NULL DO
        UPDATE SET updated_at = NOW(), status = 'pending'
    `;
    logger.info(
      `ChainhookPgStore apply contract deploy ${contract.event.principal} (${contract.event.sip}) at block ${cache.block.index}`
    );
  }

  async updateChainTipBlockHeight(blockHeight: number): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = GREATEST(${blockHeight}, block_height)`;
  }

  private async getLastIngestedBlockHeight(): Promise<number> {
    const result = await this.sql<{ block_height: number }[]>`SELECT block_height FROM chain_tip`;
    return result[0].block_height;
  }

  private async updateStacksBlock(
    sql: PgSqlClient,
    block: StacksEvent,
    direction: 'apply' | 'rollback'
  ) {
    const cache = new BlockCache(block.block_identifier);
    for (const tx of block.transactions) {
      cache.transaction(tx);
    }
    switch (direction) {
      case 'apply':
        await this.applyTransactions(sql, cache);
        break;
      case 'rollback':
        await this.rollBackTransactions(sql, cache);
        break;
    }
  }

  private async applyTransactions(sql: PgSqlClient, cache: BlockCache) {
    for (const contract of cache.contracts)
      await this.applyContractDeployment(sql, contract, cache);
    for (const notification of cache.notifications)
      await this.applyNotification(sql, notification, cache);
    for (const mint of cache.nftMints) await this.applyNftMint(sql, mint, cache);
    for (const mint of cache.sftMints) await this.applySftMint(sql, mint, cache);
    for (const [contract, delta] of cache.ftSupplyDelta)
      await this.applyFtSupplyChange(sql, contract, delta, cache);
  }

  private async rollBackTransactions(sql: PgSqlClient, cache: BlockCache) {
    for (const contract of cache.contracts)
      await this.rollBackContractDeployment(sql, contract, cache);
    for (const notification of cache.notifications)
      await this.rollBackNotification(sql, notification, cache);
    for (const mint of cache.nftMints) await this.rollBackNftMint(sql, mint, cache);
    for (const mint of cache.sftMints) await this.rollBackSftMint(sql, mint, cache);
    for (const [contract, delta] of cache.ftSupplyDelta)
      await this.applyFtSupplyChange(sql, contract, delta.negated(), cache);
  }

  private async applyNotification(
    sql: PgSqlClient,
    event: CachedEvent<TokenMetadataUpdateNotification>,
    cache: BlockCache
  ) {
    const contractResult = await sql<{ id: number }[]>`
      SELECT id FROM smart_contracts WHERE principal = ${event.event.contract_id} LIMIT 1
    `;
    if (contractResult.count == 0) {
      logger.warn(
        `ChainhookPgStore found SIP-019 notification for non-existing token contract ${event.event.contract_id} at block ${cache.block.index}`
      );
      return;
    }
    const notification = event.event;
    await sql`
      WITH affected_token_ids AS (
        SELECT t.id
        FROM tokens AS t
        INNER JOIN smart_contracts AS s ON s.id = t.smart_contract_id
        WHERE s.principal = ${notification.contract_id}
        ${
          notification.token_ids?.length
            ? sql`AND t.token_number IN ${sql(notification.token_ids)}`
            : sql``
        }
      ),
      previous_modes AS (
        SELECT DISTINCT ON (a.id) a.id, COALESCE(m.update_mode, 'standard') AS update_mode
        FROM affected_token_ids AS a
        LEFT JOIN update_notifications AS m ON a.id = m.token_id
        ORDER BY a.id, m.block_height DESC, m.tx_index DESC, m.event_index DESC
      ),
      new_mode_inserts AS (
        INSERT INTO update_notifications
        (token_id, update_mode, ttl, block_height, index_block_hash, tx_id, tx_index, event_index)
        (
          SELECT id, ${notification.update_mode}, ${notification.ttl ?? null}, ${cache.block.index},
            ${cache.block.hash}, ${event.tx_id}, ${event.tx_index},
            ${event.event_index}
          FROM previous_modes
          WHERE update_mode <> 'frozen'
        )
        RETURNING token_id
      )
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE token_id IN (SELECT token_id FROM new_mode_inserts)
    `;
    logger.info(
      `ChainhookPgStore apply SIP-019 notification ${notification.contract_id} (${
        notification.token_ids ?? 'all'
      }) at block ${cache.block.index}`
    );
  }

  private async applyNftMint(
    sql: PgSqlClient,
    mint: CachedEvent<NftMintEvent>,
    cache: BlockCache
  ): Promise<void> {
    try {
      await this.insertAndEnqueueTokens([
        {
          smart_contract_id: await this.findSmartContractId(
            mint.event.contractId,
            DbSipNumber.sip009
          ),
          type: DbTokenType.nft,
          token_number: mint.event.tokenId.toString(),
          block_height: cache.block.index,
          index_block_hash: cache.block.hash,
          tx_id: mint.tx_id,
          tx_index: mint.tx_index,
        },
      ]);
      logger.info(
        `ChainhookPgStore apply NFT mint ${mint.event.contractId} (${mint.event.tokenId}) at block ${cache.block.index}`
      );
    } catch (error) {
      if (error instanceof ContractNotFoundError)
        logger.warn(
          `ChainhookPgStore found NFT mint for nonexisting contract ${mint.event.contractId}`
        );
      else throw error;
    }
  }

  private async applySftMint(
    sql: PgSqlClient,
    mint: CachedEvent<SftMintEvent>,
    cache: BlockCache
  ): Promise<void> {
    try {
      await this.insertAndEnqueueTokens([
        {
          smart_contract_id: await this.findSmartContractId(
            mint.event.contractId,
            DbSipNumber.sip013
          ),
          type: DbTokenType.sft,
          token_number: mint.event.tokenId.toString(),
          block_height: cache.block.index,
          index_block_hash: cache.block.hash,
          tx_id: mint.tx_id,
          tx_index: mint.tx_index,
        },
      ]);
      logger.info(
        `ChainhookPgStore apply SFT mint ${mint.event.contractId} (${mint.event.tokenId}) at block ${cache.block.index}`
      );
    } catch (error) {
      if (error instanceof ContractNotFoundError)
        logger.warn(error, `ChainhookPgStore found SFT mint for nonexisting contract`);
      else throw error;
    }
  }

  private async applyFtSupplyChange(
    sql: PgSqlClient,
    contract: string,
    delta: BigNumber,
    cache: BlockCache
  ): Promise<void> {
    await sql`
      UPDATE tokens
      SET total_supply = total_supply + ${delta}
      WHERE smart_contract_id = (SELECT id FROM smart_contracts WHERE principal = ${contract})
        AND token_number = 1
    `;
    logger.info(
      `ChainhookPgStore apply FT supply change for ${contract} (${delta}) at block ${cache.block.index}`
    );
  }

  private async rollBackContractDeployment(
    sql: PgSqlClient,
    contract: CachedEvent<SmartContractDeployment>,
    cache: BlockCache
  ): Promise<void> {
    await sql`
      DELETE FROM smart_contracts WHERE principal = ${contract.event.principal}
    `;
    logger.info(
      `ChainhookPgStore rollback contract ${contract.event.principal} at block ${cache.block.index}`
    );
  }

  private async rollBackNotification(
    sql: PgSqlClient,
    notification: CachedEvent<TokenMetadataUpdateNotification>,
    cache: BlockCache
  ): Promise<void> {
    await sql`
      DELETE FROM update_notifications
      WHERE block_height = ${cache.block.index}
        AND tx_index = ${notification.tx_index}
        AND event_index = ${notification.event_index}
    `;
    logger.info(
      `ChainhookPgStore rollback SIP-019 notification ${notification.event.contract_id} (${
        notification.event.token_ids ?? 'all'
      }) at block ${cache.block.index}`
    );
  }

  private async rollBackNftMint(
    sql: PgSqlClient,
    mint: CachedEvent<NftMintEvent>,
    cache: BlockCache
  ): Promise<void> {
    try {
      const smart_contract_id = await this.findSmartContractId(
        mint.event.contractId,
        DbSipNumber.sip009
      );
      await sql`
        DELETE FROM tokens
        WHERE smart_contract_id = ${smart_contract_id} AND token_number = ${mint.event.tokenId}
      `;
      logger.info(
        `ChainhookPgStore rollback NFT mint ${mint.event.contractId} (${mint.event.tokenId}) at block ${cache.block.index}`
      );
    } catch (error) {
      if (error instanceof ContractNotFoundError)
        logger.warn(error, `ChainhookPgStore found NFT mint for nonexisting contract`);
      else throw error;
    }
  }

  private async rollBackSftMint(
    sql: PgSqlClient,
    mint: CachedEvent<SftMintEvent>,
    cache: BlockCache
  ): Promise<void> {
    try {
      const smart_contract_id = await this.findSmartContractId(
        mint.event.contractId,
        DbSipNumber.sip013
      );
      await sql`
        DELETE FROM tokens
        WHERE smart_contract_id = ${smart_contract_id} AND token_number = ${mint.event.tokenId}
      `;
      logger.info(
        `ChainhookPgStore rollback SFT mint ${mint.event.contractId} (${mint.event.tokenId}) at block ${cache.block.index}`
      );
    } catch (error) {
      if (error instanceof ContractNotFoundError)
        logger.warn(error, `ChainhookPgStore found SFT mint for nonexisting contract`);
      else throw error;
    }
  }

  private async findSmartContractId(principal: string, sip: DbSipNumber): Promise<number> {
    const result = await this.sql<{ id: number }[]>`
      SELECT id
      FROM smart_contracts
      WHERE principal = ${principal} AND sip = ${sip}
    `;
    if (result.count) return result[0].id;
    throw new ContractNotFoundError();
  }

  private async enqueueDynamicTokensDueForRefresh(): Promise<void> {
    const interval = ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL.toString();
    await this.sql`
      WITH dynamic_tokens AS (
        SELECT DISTINCT ON (token_id) token_id, ttl
        FROM update_notifications
        WHERE update_mode = 'dynamic'
        ORDER BY token_id, block_height DESC, tx_index DESC, event_index DESC
      ),
      due_for_refresh AS (
        SELECT d.token_id
        FROM dynamic_tokens AS d
        INNER JOIN tokens AS t ON t.id = d.token_id
        WHERE CASE
          WHEN d.ttl IS NOT NULL THEN
            COALESCE(t.updated_at, t.created_at) < (NOW() - INTERVAL '1 seconds' * ttl)
          ELSE
            COALESCE(t.updated_at, t.created_at) <
              (NOW() - INTERVAL '${this.sql(interval)} seconds')
          END
      )
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE status IN ('done', 'failed') AND token_id = (
        SELECT token_id FROM due_for_refresh
      )
    `;
  }

  private async insertAndEnqueueTokens(tokenValues: DbTokenInsert[]): Promise<void> {
    for await (const batch of batchIterate(tokenValues, 500)) {
      await this.sql<DbJob[]>`
        WITH token_inserts AS (
          INSERT INTO tokens ${this.sql(batch)}
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
      `;
    }
  }
}

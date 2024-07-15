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
  DbNotificationInsert,
  DbTokenType,
  DbSmartContract,
  DbTokenUpdateMode,
} from '../types';
import { BlockCache, CachedEvent } from './block-cache';
import { dbSipNumberToDbTokenType } from '../../token-processor/util/helpers';

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
    // for (const notification of cache.notifications)
    //   await this.applyNotification(sql, notification, cache);
    for (const mint of cache.nftMints) await this.rollBackNftMint(sql, mint, cache);
    for (const mint of cache.sftMints) await this.rollBackSftMint(sql, mint, cache);
    for (const [contract, delta] of cache.ftSupplyDelta)
      await this.applyFtSupplyChange(sql, contract, delta * -1n, cache);
  }

  private async applyNotification(
    sql: PgSqlClient,
    notification: CachedEvent<TokenMetadataUpdateNotification>,
    cache: BlockCache
  ) {
    const contractResult = await sql<{ id: number }[]>`
      SELECT id FROM smart_contracts WHERE principal = ${notification.event.contract_id} LIMIT 1
    `;
    if (contractResult.count == 0) {
      logger.warn(
        `ChainhookPgStore found SIP-019 notification for non-existing token contract ${notification.event.contract_id} at block ${cache.block.index}`
      );
      return;
    }
    const contractId = contractResult[0].id;
    const values: DbNotificationInsert = {
      smart_contract_id: contractId,
      block_height: cache.block.index,
      index_block_hash: cache.block.hash,
      tx_id: notification.tx_id,
      tx_index: notification.tx_index,
      event_index: notification.event_index ?? 0,
      update_mode: notification.event.update_mode as DbTokenUpdateMode,
      ttl: notification.event.ttl?.toString() ?? null,
    };
    await sql`
      WITH notification_insert AS (
        INSERT INTO notifications ${sql(values)}
        ON CONFLICT ON CONSTRAINT notifications_unique DO UPDATE SET
          update_mode = EXCLUDED.update_mode,
          ttl = EXCLUDED.ttl
        RETURNING id
      ),
      relationship_inserts AS (
        INSERT INTO notifications_tokens (notification_id, smart_contract_id, token_id)
        (${
          notification.event.token_ids?.length
            ? sql`
              SELECT
                (SELECT id FROM notification_insert) AS notification_id,
                smart_contract_id,
                id AS token_id
              FROM tokens
              WHERE smart_contract_id = ${contractId}
                AND token_number IN ${sql(notification.event.token_ids)}
              `
            : sql`
              SELECT
                (SELECT id FROM notification_insert) AS notification_id,
                ${contractId} AS smart_contract_id,
                NULL AS token_id
              `
        })
      ),
      frozen_token_inserts AS (
        ${
          notification.event.update_mode === 'frozen'
            ? sql`
              INSERT INTO frozen_tokens (token_id, notification_id)
              (
                SELECT id AS token_id, (SELECT id FROM notification_insert) AS notification_id
                FROM tokens
                WHERE smart_contract_id = ${contractId}
                ${
                  notification.event.token_ids?.length
                    ? sql`AND token_number IN ${sql(notification.event.token_ids)}`
                    : sql``
                }
              )
              `
            : sql`SELECT 1`
        }
      )
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE token_id IN (
        SELECT t.id
        FROM tokens AS t
        WHERE t.smart_contract_id = ${contractId}
          AND NOT EXISTS (SELECT 1 FROM frozen_tokens WHERE token_id = t.id)
          ${
            notification.event.token_ids?.length
              ? sql`AND token_number IN ${sql(notification.event.token_ids)}`
              : sql``
          }
      )
    `;
    logger.info(
      `ChainhookPgStore apply SIP-019 notification ${notification.event.contract_id} (${
        notification.event.token_ids ?? 'all'
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
        logger.warn(error, `ChainhookPgStore found NFT mint for nonexisting contract`);
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
    delta: bigint,
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

  // private async rollBackPrintEvent(
  //   sql: PgSqlClient,
  //   block: BlockIdentifier,
  //   tx: StacksTransaction,
  //   event: StacksTransactionSmartContractEvent
  // ): Promise<void> {
  //   // SIP-019 notification?
  //   const notification = getContractLogMetadataUpdateNotification(tx.metadata.sender, event);
  //   if (notification) {
  //     const contractResult = await sql<{ id: number }[]>`
  //       SELECT id FROM smart_contracts WHERE principal = ${notification.contract_id}
  //     `;
  //     if (contractResult.count === 0) {
  //       logger.warn(
  //         `ChainhookPgStore rollback SIP-019 notification for non-existing contract ${notification.contract_id}`
  //       );
  //       return;
  //     }
  //     const contractId = contractResult[0].id;
  //     await sql`
  //       UPDATE tokens SET
  //     `;
  //     await sql`
  //       DELETE FROM token_metadata_notifications
  //       WHERE smart_contract_id = ${contractId}
  //         AND block_height = ${block.index}
  //         AND index_block_hash = ${block.hash}
  //         AND tx_id = ${tx.transaction_identifier.hash}
  //         AND tx_index = ${tx.metadata.position.index}
  //         AND event_index = ${event.position.index}
  //     `;
  //     return;
  //   }
  //   // SIP-013 SFT mint?
  //   const mint = getContractLogSftMintEvent(event);
  //   if (mint) {
  //     const smart_contract_id = await this.findSmartContractId(mint.contractId, DbSipNumber.sip013);
  //     if (smart_contract_id) {
  //       await this.sql`
  //         DELETE FROM tokens
  //         WHERE smart_contract_id = ${smart_contract_id} AND token_number = ${mint.tokenId}
  //       `;
  //       logger.info(`ChainhookPgStore rollback SFT mint ${mint.contractId} (${mint.tokenId})`);
  //     }
  //   }
  // }

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

  private async updateChainTipBlockHeight(blockHeight: number): Promise<void> {
    await this.sql`UPDATE chain_tip SET block_height = GREATEST(${blockHeight}, block_height)`;
  }

  private async enqueueDynamicTokensDueForRefresh(): Promise<void> {
    const interval = ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL.toString();
    await this.sql`
      WITH dynamic_tokens AS (
        SELECT nt.token_id, n.ttl
        FROM notifications_tokens AS nt
        INNER JOIN notifications AS n ON n.id = nt.notification_id
        WHERE n.update_mode = 'dynamic'
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

import { BasePgStoreModule, PgSqlClient, logger, stopwatch } from '@hirosystems/api-toolkit';
import {
  BlockIdentifier,
  StacksEvent,
  StacksPayload,
  StacksTransaction,
  StacksTransactionContractDeploymentKind,
  StacksTransactionFtBurnEvent,
  StacksTransactionFtMintEvent,
  StacksTransactionNftMintEvent,
  StacksTransactionSmartContractEvent,
} from '@hirosystems/chainhook-client';
import { ClarityAbi } from '@stacks/transactions';
import { ENV } from '../../env';
import {
  getSmartContractSip,
  getContractLogMetadataUpdateNotification,
  getContractLogSftMintEvent,
  TokenMetadataUpdateNotification,
} from '../../token-processor/util/sip-validation';
import { ContractNotFoundError } from '../errors';
import {
  DbJob,
  DbSipNumber,
  DbSmartContractInsert,
  DbTokenInsert,
  DbTokenMetadataNotificationInsert,
  DbTokenType,
  DbTokenUpdateMode,
  JOBS_COLUMNS,
} from '../types';
import { ClarityTypeID, decodeClarityValue } from 'stacks-encoding-native-js';
import { BlockCache } from './block-cache';

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

  private async updateStacksBlock(
    sql: PgSqlClient,
    block: StacksEvent,
    direction: 'apply' | 'rollback'
  ) {
    const cache = new BlockCache(block.block_identifier.index);
    for (const tx of block.transactions) {
      cache.transaction(tx);
    }
    switch (direction) {
      case 'apply':
        await this.applyInscriptions(sql, cache);
        break;
      case 'rollback':
        await this.rollBackInscriptions(sql, cache);
        break;
    }
  }

  private async applyInscriptions(sql: PgSqlClient, cache: BlockCache) {
    for (const values of cache.contracts) {
      await this.insertAndEnqueueSmartContract({ values });
      logger.info(
        `ChainhookPgStore apply contract deploy ${values.principal} (${values.sip}) at block ${cache.blockHeight}`
      );
    }
    for (const notification of cache.notifications) {
      await this.enqueueTokenMetadataUpdateNotification({ block, event, tx, notification });
      logger.info(
        `ChainhookPgStore SIP-019 notification ${notification.contract_id} (${
          notification.token_ids ?? 'all'
        })`
      );
    }
  }

  private async rollBackContractDeployment(tx: StacksTransaction): Promise<void> {
    const kind = tx.metadata.kind as StacksTransactionContractDeploymentKind;
    await this.sql`
      DELETE FROM smart_contracts WHERE principal = ${kind.data.contract_identifier}
    `;
    logger.info(`ChainhookPgStore rollback contract ${kind.data.contract_identifier}`);
  }

  private async applyPrintEvent(
    block: BlockIdentifier,
    tx: StacksTransaction,
    event: StacksTransactionSmartContractEvent
  ): Promise<void> {
    // SIP-019 notification?
    const notification = getContractLogMetadataUpdateNotification(tx.metadata.sender, event);
    if (notification) {
      try {
        await this.enqueueTokenMetadataUpdateNotification({ block, event, tx, notification });
        logger.info(
          `ChainhookPgStore SIP-019 notification ${notification.contract_id} (${
            notification.token_ids ?? 'all'
          })`
        );
      } catch (error) {
        if (error instanceof ContractNotFoundError)
          logger.warn(
            `ChainhookPgStore detected SIP-019 notification for non-existing contract ${notification.contract_id}`
          );
        else throw error;
      }
      return;
    }
    // SIP-013 SFT mint?
    const mint = getContractLogSftMintEvent(event);
    if (mint) {
      try {
        await this.insertAndEnqueueTokens([
          {
            smart_contract_id: await this.findSmartContractId(mint.contractId, DbSipNumber.sip013),
            type: DbTokenType.sft,
            token_number: mint.tokenId.toString(),
          },
        ]);
        logger.info(`ChainhookPgStore SFT mint ${mint.contractId} (${mint.tokenId})`);
      } catch (error) {
        if (error instanceof ContractNotFoundError)
          logger.warn(`ChainhookPgStore SFT mint for non-existing contract ${mint.contractId}`);
        else throw error;
      }
    }
  }

  private async rollBackPrintEvent(
    sql: PgSqlClient,
    block: BlockIdentifier,
    tx: StacksTransaction,
    event: StacksTransactionSmartContractEvent
  ): Promise<void> {
    // SIP-019 notification?
    const notification = getContractLogMetadataUpdateNotification(tx.metadata.sender, event);
    if (notification) {
      const contractResult = await sql<{ id: number }[]>`
        SELECT id FROM smart_contracts WHERE principal = ${notification.contract_id}
      `;
      if (contractResult.count === 0) {
        logger.warn(
          `ChainhookPgStore rollback SIP-019 notification for non-existing contract ${notification.contract_id}`
        );
        return;
      }
      const contractId = contractResult[0].id;
      await sql`
        UPDATE tokens SET 
      `;
      await sql`
        DELETE FROM token_metadata_notifications
        WHERE smart_contract_id = ${contractId}
          AND block_height = ${block.index}
          AND index_block_hash = ${block.hash}
          AND tx_id = ${tx.transaction_identifier.hash}
          AND tx_index = ${tx.metadata.position.index}
          AND event_index = ${event.position.index}
      `;
      return;
    }
    // SIP-013 SFT mint?
    const mint = getContractLogSftMintEvent(event);
    if (mint) {
      const smart_contract_id = await this.findSmartContractId(mint.contractId, DbSipNumber.sip013);
      if (smart_contract_id) {
        await this.sql`
          DELETE FROM tokens
          WHERE smart_contract_id = ${smart_contract_id} AND token_number = ${mint.tokenId}
        `;
        logger.info(`ChainhookPgStore rollback SFT mint ${mint.contractId} (${mint.tokenId})`);
      }
    }
  }

  private async applyFtMintOrBurnEvent(
    event: StacksTransactionFtMintEvent | StacksTransactionFtBurnEvent
  ): Promise<void> {
    const action = event.type === 'FTMintEvent' ? 'mint' : 'burn';
    const principal = event.data.asset_identifier.split('::')[0];
    try {
      // TODO: We only need to update the FT's total supply here, not the entire metadata.
      await this.insertAndEnqueueTokens([
        {
          smart_contract_id: await this.findSmartContractId(principal, DbSipNumber.sip010),
          type: DbTokenType.ft,
          token_number: '1',
        },
      ]);
      logger.info(`ChainhookPgStore ${action} FT ${principal}`);
    } catch (error) {
      if (error instanceof ContractNotFoundError)
        logger.warn(
          `ChainhookPgStore detected FT ${action} for non-existing contract ${principal}`
        );
      else throw error;
    }
  }

  private async applyNftMintEvent(event: StacksTransactionNftMintEvent): Promise<void> {
    const principal = event.data.asset_identifier.split('::')[0];
    try {
      const value = decodeClarityValue(event.data.raw_value);
      if (value.type_id !== ClarityTypeID.UInt) return;
      await this.insertAndEnqueueTokens([
        {
          smart_contract_id: await this.findSmartContractId(principal, DbSipNumber.sip009),
          type: DbTokenType.nft,
          token_number: value.value,
        },
      ]);
      logger.info(`ChainhookPgStore mint NFT ${principal} #${value.value}`);
    } catch (error) {
      if (error instanceof ContractNotFoundError)
        logger.warn(`ChainhookPgStore detected NFT mint for non-existing contract ${principal}`);
      else throw error;
    }
  }

  private async rollBackNftMintEvent(event: StacksTransactionNftMintEvent): Promise<void> {
    const principal = event.data.asset_identifier.split('::')[0];
    const smart_contract_id = await this.findSmartContractId(principal, DbSipNumber.sip009);
    if (smart_contract_id) {
      const value = decodeClarityValue(event.data.raw_value);
      if (value.type_id !== ClarityTypeID.UInt) return;
      await this.sql`
        DELETE FROM tokens
        WHERE smart_contract_id = ${smart_contract_id} AND token_number = ${value.value}
      `;
      logger.info(`ChainhookPgStore rollback NFT mint ${principal} (${value.value})`);
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
      UPDATE jobs
      SET status = 'pending', updated_at = NOW()
      WHERE status IN ('done', 'failed') AND token_id = (
        SELECT t.id
        FROM tokens AS t
        LEFT JOIN token_metadata_notifications AS n ON t.token_metadata_notification_id = n.id
        WHERE n.update_mode = 'dynamic'
        AND CASE
          WHEN ttl IS NOT NULL THEN
            COALESCE(t.updated_at, t.created_at) < (NOW() - INTERVAL '1 seconds' * ttl)
          ELSE
            COALESCE(t.updated_at, t.created_at) < (NOW() - INTERVAL '${this.sql(
              interval
            )} seconds')
        END
      )
    `;
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

  /**
   * Enqueues the tokens specified by a SIP-019 notification for metadata refresh. Depending on the
   * token type and notification parameters, this will refresh specific tokens or complete
   * contracts. See SIP-019 for more info.
   */
  async enqueueTokenMetadataUpdateNotification(args: {
    block: BlockIdentifier;
    tx: StacksTransaction;
    event: StacksTransactionSmartContractEvent;
    notification: TokenMetadataUpdateNotification;
  }): Promise<void> {
    await this.sqlWriteTransaction(async sql => {
      const contractResult = await sql<{ id: number }[]>`
        SELECT id FROM smart_contracts WHERE principal = ${args.notification.contract_id}
      `;
      if (contractResult.count === 0) throw new ContractNotFoundError();
      const contractId = contractResult[0].id;
      const tokenNumbers =
        args.notification.token_class === 'ft' ? [1n] : args.notification.token_ids ?? [];

      const notification: DbTokenMetadataNotificationInsert = {
        smart_contract_id: contractId,
        tx_id: args.tx.transaction_identifier.hash,
        block_height: args.block.index,
        index_block_hash: args.block.hash,
        tx_index: args.tx.metadata.position.index,
        event_index: args.event.position.index,
        update_mode: args.notification.update_mode as DbTokenUpdateMode,
        ttl: args.notification.ttl?.toString() ?? null,
      };
      await sql`
        WITH notification_insert AS (
          INSERT INTO token_metadata_notifications ${sql(notification)}
          ON CONFLICT ON CONSTRAINT token_metadata_notifications_unique DO UPDATE SET
            update_mode = EXCLUDED.update_mode,
            ttl = EXCLUDED.ttl
          RETURNING id
        ),
        updated_tokens AS (
          UPDATE tokens
          SET token_metadata_notification_id = (SELECT id FROM notification_insert)
          WHERE id IN (
            SELECT t.id FROM tokens AS t
            LEFT JOIN token_metadata_notifications AS n ON t.token_metadata_notification_id = n.id
            WHERE t.smart_contract_id = ${contractId}
              AND (t.token_metadata_notification_id IS NULL OR n.update_mode <> 'frozen')
              ${tokenNumbers.length ? sql`AND token_number IN ${sql(tokenNumbers)}` : sql``}
          )
          RETURNING id
        )
        UPDATE jobs
        SET status = 'pending', updated_at = NOW()
        WHERE token_id IN (SELECT id FROM updated_tokens)
      `;
    });
  }

  async insertAndEnqueueTokens(tokenValues: DbTokenInsert[]): Promise<DbJob[]> {
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

  /**
   * Inserts new tokens and new token queue entries until `token_count` items are created, usually
   * used when processing an NFT contract.
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
    return this.insertAndEnqueueTokens(tokenValues);
  }
}
import * as postgres from 'postgres';
import { PgStore } from '../../pg/pg-store';
import { PgBlockchainApiStore } from '../../pg/blockchain-api/pg-blockchain-api-store';
import {
  getContractLogMetadataUpdateNotification,
  getContractLogSftMintEvent,
  getSmartContractSip,
} from '../util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';
import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { logger } from '../../logger';
import { DbSipNumber, DbTokenType } from '../../pg/types';

const PgNotification = Type.Object({
  type: Type.String(),
  payload: Type.Object({}, { additionalProperties: true }),
});
const PgNotificationCType = TypeCompiler.Compile(PgNotification);

const PgSmartContractPayload = Type.Object({ contractId: Type.String() });
const PgSmartContractPayloadCType = TypeCompiler.Compile(PgSmartContractPayload);
type PgSmartContractPayloadType = Static<typeof PgSmartContractPayload>;

const PgSmartContractLogPayload = Type.Object({ txId: Type.String(), eventIndex: Type.Integer() });
const PgSmartContractPayloadLogCType = TypeCompiler.Compile(PgSmartContractLogPayload);
type PgSmartContractPayloadLogType = Static<typeof PgSmartContractLogPayload>;

const PgBlockPayload = Type.Object({ blockHash: Type.String() });
const PgBlockPayloadCType = TypeCompiler.Compile(PgBlockPayload);
type PgBlockPayloadType = Static<typeof PgBlockPayload>;

/**
 * Listens for postgres notifications emitted from the API database when new contracts are deployed,
 * contract logs are registered, or new blocks are produced. It will analyze each of them to
 * determine if:
 * - A new token contract needs indexing
 * - A SIP-019 notifications calls for a token metadata refresh
 * - A SIP-013 mint event declared a new SFT that needs metadata processing
 * - `dynamic` token metadata needs to be refreshed.
 */
export class BlockchainSmartContractMonitor {
  private readonly db: PgStore;
  private readonly apiDb: PgBlockchainApiStore;
  private listener?: postgres.ListenMeta;

  constructor(args: { db: PgStore; apiDb: PgBlockchainApiStore }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
  }

  async start() {
    try {
      this.listener = await this.apiDb.sql.listen(
        'stacks-api-pg-notifier',
        message => void this.handleMessage(message),
        () => logger.info(`BlockchainSmartContractMonitor connected`)
      );
    } catch (error) {
      logger.error(error, 'BlockchainSmartContractMonitor unable to connect');
      throw error;
    }
  }

  async stop() {
    await this.listener
      ?.unlisten()
      .then(() => logger.info('BlockchainSmartContractMonitor connection closed'));
  }

  protected async handleMessage(message: string) {
    const messageJson = JSON.parse(message);
    if (PgNotificationCType.Check(messageJson)) {
      switch (messageJson.type) {
        case 'smartContractUpdate':
          if (PgSmartContractPayloadCType.Check(messageJson.payload)) {
            try {
              await this.handleSmartContract(messageJson.payload);
            } catch (error) {
              logger.error(error, 'BlockchainSmartContractMonitor error handling contract deploy');
            }
          }
          break;
        case 'smartContractLogUpdate':
          if (PgSmartContractPayloadLogCType.Check(messageJson.payload)) {
            try {
              await this.handleSmartContractLog(messageJson.payload);
            } catch (error) {
              logger.error(error, 'BlockchainSmartContractMonitor error handling contract log');
            }
          }
          break;
        case 'blockUpdate':
          if (PgBlockPayloadCType.Check(messageJson.payload)) {
            try {
              await this.handleBlock(messageJson.payload);
            } catch (error) {
              logger.error(error, 'BlockchainSmartContractMonitor error handling block');
            }
          }
          break;
        default:
          break;
      }
    }
  }

  private async handleSmartContract(payload: PgSmartContractPayloadType) {
    const contract = await this.apiDb.getSmartContract({ ...payload });
    if (!contract) {
      return;
    }
    const sip = getSmartContractSip(contract.abi as ClarityAbi);
    if (!sip) {
      return; // Not a token contract.
    }
    await this.db.insertAndEnqueueSmartContract({
      values: {
        principal: contract.contract_id,
        sip: sip,
        abi: contract.abi,
        tx_id: contract.tx_id,
        block_height: contract.block_height,
      },
    });
    logger.info(`BlockchainSmartContractMonitor detected (${sip}): ${contract.contract_id}`);
  }

  private async handleSmartContractLog(payload: PgSmartContractPayloadLogType) {
    const log = await this.apiDb.getSmartContractLog({ ...payload });
    if (!log) {
      return;
    }
    // SIP-019 notification?
    const notification = getContractLogMetadataUpdateNotification(log);
    if (notification) {
      await this.db.enqueueTokenMetadataUpdateNotification({ notification });
      logger.info(
        `BlockchainSmartContractMonitor detected SIP-019 notification for ${
          notification.contract_id
        } ${notification.token_ids ?? []}`
      );
      return;
    }
    // SIP-013 SFT mint?
    const mint = getContractLogSftMintEvent(log);
    if (mint) {
      const contract = await this.db.getSmartContract({ principal: mint.contractId });
      if (contract && contract.sip === DbSipNumber.sip013) {
        await this.db.insertAndEnqueueTokenArray([
          {
            smart_contract_id: contract.id,
            type: DbTokenType.sft,
            token_number: mint.tokenId.toString(),
          },
        ]);
        logger.info(
          `BlockchainSmartContractMonitor detected SIP-013 SFT mint event for ${mint.contractId} ${mint.tokenId}`
        );
      }
    }
  }

  private async handleBlock(payload: PgBlockPayloadType) {
    const block = await this.apiDb.getBlock({ blockHash: payload.blockHash });
    if (!block) {
      return;
    }
    // Keep latest observed block height so we can know the last synchronization point for this
    // service.
    await this.db.updateChainTipBlockHeight({ blockHeight: block.block_height });
    await this.db.enqueueDynamicTokensDueForRefresh();
  }
}

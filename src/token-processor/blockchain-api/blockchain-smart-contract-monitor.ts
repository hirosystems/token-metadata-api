import * as postgres from 'postgres';
import { PgStore } from '../../pg/pg-store';
import { PgBlockchainApiStore } from '../../pg/blockchain-api/pg-blockchain-api-store';
import {
  getContractLogMetadataUpdateNotification,
  getSmartContractSip,
} from '../util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';
import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { logger } from '../../logger';

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

/**
 * Listens for postgres notifications emitted from the API database when new contracts are deployed
 * or contract logs are registered. It will analyze each of them to determine if they're new token
 * contracts that need indexing or SIP-019 notifications that call for a token metadata refresh.
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
      logger.error(`BlockchainSmartContractMonitor unable to connect`, error);
      throw error;
    }
  }

  async stop() {
    await this.listener
      ?.unlisten()
      .then(() => logger.info(`BlockchainSmartContractMonitor connection closed`));
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
              logger.error(`BlockchainSmartContractMonitor error handling contract deploy`, error);
            }
          }
          break;
        case 'smartContractLogUpdate':
          if (PgSmartContractPayloadLogCType.Check(messageJson.payload)) {
            try {
              await this.handleSmartContractLog(messageJson.payload);
            } catch (error) {
              logger.error(`BlockchainSmartContractMonitor error handling contract log`, error);
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
        abi: JSON.stringify(contract.abi),
        tx_id: contract.tx_id,
        block_height: contract.block_height,
      },
    });
    logger.info(`BlockchainSmartContractMonitor detected (${sip}): ${contract.contract_id}`);
  }

  private async handleSmartContractLog(payload: PgSmartContractPayloadLogType) {
    const event = await this.apiDb.getSmartContractLog({ ...payload });
    if (!event) {
      return;
    }
    const notification = getContractLogMetadataUpdateNotification(event);
    if (!notification) {
      return; // Not a valid SIP-019 notification.
    }
    await this.db.enqueueTokenMetadataUpdateNotification({ notification });
    logger.info(
      `BlockchainSmartContractMonitor detected SIP-019 notification for ${
        notification.contract_id
      } ${notification.token_ids ?? []}`
    );
  }
}

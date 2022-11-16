import * as postgres from 'postgres';
import { PgStore } from '../../pg/pg-store';
import { PgBlockchainApiStore } from '../../pg/blockchain-api/pg-blockchain-api-store';
import { getSmartContractSip } from '../util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';

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
        () => console.info(`PgBlockchainSmartContractMonitor connected`)
      );
    } catch (error) {
      console.error(`PgBlockchainSmartContractMonitor unable to connect`, error);
      throw error;
    }
  }

  async stop() {
    await this.listener
      ?.unlisten()
      .then(() => console.info(`PgBlockchainSmartContractMonitor connection closed`));
  }

  private async handleMessage(message: string) {
    const messageJson = JSON.parse(message);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    switch (messageJson.type) {
      case 'smartContractUpdate':
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        await this.handleSmartContract(messageJson.payload);
        break;
      case 'smartContractLogUpdate':
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this.handleSmartContractLog(messageJson.payload);
        break;
      default:
        break;
    }
  }

  private async handleSmartContract(payload: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const sip = getSmartContractSip(payload.abi as ClarityAbi);
    if (!sip) {
      return; // Not a token contract.
    }
    await this.db.insertAndEnqueueSmartContract({
      values: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        principal: payload.contract_id,
        sip: sip,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        abi: JSON.stringify(payload.abi),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        tx_id: payload.tx_id,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        block_height: payload.block_height,
      },
    });
    console.info(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      `BlockchainSmartContractMonitor detected (${sip}): ${payload.contract_id as string}`
    );
  }

  private handleSmartContractLog(payload: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (payload.topic !== 'print' && payload.value.notification !== 'token-metadata-update') {
      return;
    }
    // const
  }
}

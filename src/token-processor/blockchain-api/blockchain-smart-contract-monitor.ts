import * as postgres from 'postgres';
import { PgStore } from '../../pg/pg-store';
import { PgBlockchainApiStore } from '../../pg/blockchain-api/pg-blockchain-api-store';
import { getSmartContractSip } from '../util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';

export class BlockchainSmartContractMonitor {
  private readonly db: PgStore; 
  private readonly apiDb: PgBlockchainApiStore;
  private listener?: postgres.ListenMeta;

  constructor(args: {
    db: PgStore,
    apiDb: PgBlockchainApiStore
  }) {
    this.db = args.db;
    this.apiDb = args.apiDb;
  }

  async start() {
    try {
      this.listener = await this.apiDb.sql.listen(
        'stacks-api-pg-notifier',
        message => this.handleMessage(message),
        () => console.info(`PgBlockchainSmartContractMonitor connected`)
      )
    } catch (error) {
      console.error(`PgBlockchainSmartContractMonitor unable to connect: ${error}`);
      throw error;
    }
  }

  async stop() {
    await this.listener
      ?.unlisten()
      .then(() => console.info(`PgBlockchainSmartContractMonitor connection closed`));
  }

  private handleMessage(message: string) {
    const messageJson = JSON.parse(message);
    switch (messageJson.type) {
      case 'smartContractUpdate':
        this.handleSmartContract(messageJson.payload);
        break;
      case 'smartContractLogUpdate':
        this.handleSmartContractLog(messageJson.payload);
        break;
      default:
        break;
    }
  }

  private async handleSmartContract(payload: any) {
    const sip = getSmartContractSip(payload.abi as ClarityAbi);
    if (!sip) {
      return; // Not a token contract.
    }
    await this.db.insertAndEnqueueSmartContract({
      values: {
        principal: payload.contract_id,
        sip: sip,
        abi: JSON.stringify(payload.abi),
        tx_id: payload.tx_id,
        block_height: payload.block_height
      }
    });
    console.info(`BlockchainSmartContractMonitor detected (${sip}): ${payload.contract_id}`);
  }

  private async handleSmartContractLog(payload: any) {
    if (payload.topic !== 'print' && payload.value.notification !== 'token-metadata-update') {
      return;
    }
    // const 
  }
}

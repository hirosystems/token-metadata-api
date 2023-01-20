import { ENV } from '../../env';
import { connectPostgres } from '../postgres-tools';
import { BasePgStore } from '../postgres-tools/base-pg-store';

export interface BlockchainDbSmartContract {
  contract_id: string;
  tx_id: string;
  block_height: number;
  abi: any;
}

export interface BlockchainDbContractLog {
  contract_identifier: string;
  sender_address: string;
  value: string;
}

export interface BlockchainDbBlock {
  block_height: number;
  block_hash: string;
  index_block_hash: string;
}

/**
 * Connects and queries the Stacks Blockchain API postgres DB.
 */
export class PgBlockchainApiStore extends BasePgStore {
  static async connect() {
    const sql = await connectPostgres({
      usageName: 'tms-blockchain-api',
      connectionArgs: {
        host: ENV.BLOCKCHAIN_API_PGHOST,
        port: ENV.BLOCKCHAIN_API_PGPORT,
        user: ENV.BLOCKCHAIN_API_PGUSER,
        password: ENV.BLOCKCHAIN_API_PGPASSWORD,
        database: ENV.BLOCKCHAIN_API_PGDATABASE,
      },
      connectionConfig: {
        poolMax: ENV.BLOCKCHAIN_API_PG_CONNECTION_POOL_MAX,
        idleTimeout: ENV.BLOCKCHAIN_API_PG_IDLE_TIMEOUT,
        maxLifetime: ENV.BLOCKCHAIN_API_PG_MAX_LIFETIME,
      },
    });
    return new PgBlockchainApiStore(sql);
  }

  getSmartContractsCursor(args: {
    afterBlockHeight: number;
  }): AsyncIterable<BlockchainDbSmartContract[]> {
    return this.sql<BlockchainDbSmartContract[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (contract_id) contract_id, tx_id, block_height, microblock_sequence, abi
        FROM smart_contracts
        WHERE
          canonical = TRUE
          AND microblock_canonical = TRUE
          AND block_height >= ${args.afterBlockHeight}
          AND abi <> '"null"'
        ORDER BY contract_id, block_height DESC, microblock_sequence DESC
      ) AS contract_list
      ORDER BY block_height ASC
    `.cursor();
  }

  async getSmartContract(args: {
    contractId: string;
  }): Promise<BlockchainDbSmartContract | undefined> {
    const result = await this.sql<BlockchainDbSmartContract[]>`
      SELECT contract_id, tx_id, block_height, microblock_sequence, abi
      FROM smart_contracts
      WHERE contract_id = ${args.contractId}
      ORDER BY abi != 'null' DESC, canonical DESC, microblock_canonical DESC, block_height DESC
      LIMIT 1
    `;
    if (result.count) {
      return result[0];
    }
  }

  async getSmartContractLog(args: {
    txId: string;
    eventIndex: number;
  }): Promise<BlockchainDbContractLog | undefined> {
    const result = await this.sql<BlockchainDbContractLog[]>`
      SELECT contract_identifier, value, sender_address
      FROM contract_logs
      WHERE canonical = TRUE
        AND microblock_canonical = true
        AND tx_id = ${args.txId}
        AND event_index = ${args.eventIndex}
      ORDER BY block_height DESC, microblock_sequence DESC, tx_index DESC, event_index DESC
      LIMIT 1
    `;
    if (result.count) {
      return result[0];
    }
  }

  async getBlock(args: { blockHash: string }): Promise<BlockchainDbBlock | undefined> {
    const result = await this.sql<BlockchainDbBlock[]>`
      SELECT block_height, block_hash, index_block_hash
      FROM blocks
      WHERE canonical = TRUE AND block_hash = ${args.blockHash}
      LIMIT 1
    `;
    if (result.count) {
      return result[0];
    }
  }

  getSmartContractLogsByContractCursor(args: {
    contractId: string;
  }): AsyncIterable<BlockchainDbContractLog[]> {
    return this.sql<BlockchainDbContractLog[]>`
      SELECT contract_identifier, value, sender_address
      FROM contract_logs
      WHERE contract_identifier = ${args.contractId}
        AND canonical = TRUE
        AND microblock_canonical = TRUE
      ORDER BY block_height DESC, microblock_sequence DESC, tx_index DESC, event_index DESC
    `.cursor();
  }
}

import { BasePgStore, connectPostgres } from '@hirosystems/api-toolkit';
import { ENV } from '../../env';

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
    fromBlockHeight: number;
    toBlockHeight: number;
  }): AsyncIterable<BlockchainDbSmartContract[]> {
    return this.sql<BlockchainDbSmartContract[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (contract_id) contract_id, tx_id, block_height, microblock_sequence, abi
        FROM smart_contracts
        WHERE
          canonical = TRUE
          AND microblock_canonical = TRUE
          AND block_height >= ${args.fromBlockHeight}
          AND block_height <= ${args.toBlockHeight}
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
      SELECT l.contract_identifier, l.value, t.sender_address
      FROM contract_logs AS l
      INNER JOIN txs AS t USING (tx_id, index_block_hash, microblock_hash)
      WHERE l.canonical = TRUE
        AND l.microblock_canonical = true
        AND l.tx_id = ${args.txId}
        AND l.event_index = ${args.eventIndex}
      ORDER BY l.block_height DESC, l.microblock_sequence DESC, l.tx_index DESC, l.event_index DESC
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

  async getCurrentBlockHeight(): Promise<number | undefined> {
    const result = await this.sql<{ block_height: number }[]>`
      SELECT block_height FROM chain_tip LIMIT 1
    `;
    if (result.count) {
      return result[0].block_height;
    }
  }

  getSmartContractLogsByContractCursor(args: {
    contractId: string;
  }): AsyncIterable<BlockchainDbContractLog[]> {
    return this.sql<BlockchainDbContractLog[]>`
      SELECT l.contract_identifier, l.value, t.sender_address
      FROM contract_logs AS l
      INNER JOIN txs AS t USING (tx_id, index_block_hash, microblock_hash)
      WHERE l.contract_identifier = ${args.contractId}
        AND l.canonical = TRUE
        AND l.microblock_canonical = TRUE
      ORDER BY l.block_height DESC, l.microblock_sequence DESC, l.tx_index DESC, l.event_index DESC
    `.cursor();
  }

  getSmartContractLogsCursor(args: {
    fromBlockHeight: number;
    toBlockHeight: number;
  }): AsyncIterable<BlockchainDbContractLog[]> {
    return this.sql<BlockchainDbContractLog[]>`
      SELECT l.contract_identifier, l.value, t.sender_address
      FROM contract_logs AS l
      INNER JOIN txs AS t USING (tx_id, index_block_hash, microblock_hash)
      WHERE l.canonical = TRUE
        AND l.microblock_canonical = TRUE
        AND l.block_height >= ${args.fromBlockHeight}
        AND l.block_height <= ${args.toBlockHeight}
      ORDER BY l.block_height ASC
    `.cursor();
  }
}

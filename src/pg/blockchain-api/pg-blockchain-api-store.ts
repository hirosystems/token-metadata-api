import * as postgres from 'postgres';
import { ENV } from '../../util/env';

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

/**
 * Connects and queries the Stacks Blockchain API postgres DB.
 */
export class PgBlockchainApiStore {
  readonly sql: postgres.Sql<any>;

  constructor() {
    this.sql = postgres({
      host: ENV.BLOCKCHAIN_API_PGHOST,
      port: ENV.BLOCKCHAIN_API_PGPORT,
      user: ENV.BLOCKCHAIN_API_PGUSER,
      password: ENV.BLOCKCHAIN_API_PGPASSWORD,
      database: ENV.BLOCKCHAIN_API_PGDATABASE
    });    
  }

  async getSmartContractsCursor(
    args: { afterBlockHeight: number }
  ): Promise<AsyncIterable<BlockchainDbSmartContract[]>> {
    return this.sql<BlockchainDbSmartContract[]>`
      SELECT DISTINCT ON (contract_id) contract_id, tx_id, block_height, microblock_sequence, abi
      FROM smart_contracts
      WHERE
        canonical = TRUE
        AND microblock_canonical = TRUE
        AND block_height >= ${args.afterBlockHeight}
        AND abi <> '"null"'
      ORDER BY contract_id, block_height DESC, microblock_sequence DESC
    `.cursor();
  }

  async getContractLogsCursor(
    args: { afterBlockHeight: number }
  ): Promise<AsyncIterable<BlockchainDbContractLog[]>> {
    return this.sql<BlockchainDbContractLog[]>`
      SELECT l.contract_identifier, l.value, t.sender_address
      FROM txs AS t 
      INNER JOIN contract_logs AS l ON l.tx_id = t.tx_id
      WHERE
        t.type_id = 2
        AND t.canonical = TRUE
        AND t.microblock_canonical = TRUE
        AND t.block_height >= ${args.afterBlockHeight}
        AND l.topic = 'print'
      ORDER BY t.block_height DESC
    `.cursor();
  }
}

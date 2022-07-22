import * as postgres from 'postgres';
import { ENV } from '../..';

export interface BlockchainDbSmartContract {
  contract_id: string;
  tx_id: string;
  block_height: number;
  abi: any;
}

/**
 * Connects and queries the Stacks Blockchain API postgres DB.
 */
export class PgBlockchainApiStore {
  private readonly sql: postgres.Sql<any>;

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
    args: { afterBlockHeight?: number }
  ): Promise<AsyncIterable<BlockchainDbSmartContract[]>> {
    const afterBlockHeight = args.afterBlockHeight ?? 1;
    // FIXME: Add index to api db
    return this.sql<BlockchainDbSmartContract[]>`
      SELECT DISTINCT ON (contract_id) contract_id, tx_id, block_height, microblock_sequence, abi
      FROM smart_contracts
      WHERE
        canonical = TRUE
        AND microblock_canonical = TRUE
        AND block_height >= ${afterBlockHeight}
        AND abi <> '"null"'
      ORDER BY contract_id, block_height DESC, microblock_sequence DESC
      LIMIT 100
    `.cursor();
  }
}

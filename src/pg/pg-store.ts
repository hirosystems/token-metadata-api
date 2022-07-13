import * as postgres from 'postgres';
import { FungibleTokenResponseType, NonFungibleTokenResponseType, SmartContractIDType } from '../api/types';
import { DbSmartContract, DbSmartContractInsert, DbQueueEntryStatus, DbSmartContractQueueEntry, FoundOrNot } from './types';

export class PgStore {
  private readonly sql: postgres.Sql<any>;

  constructor() {
    this.sql = postgres();
  }

  async insertSmartContract(smartContract: DbSmartContractInsert): Promise<DbSmartContract> {
    const data = {
      ...smartContract,
      created_at: this.sql`now()`,
      updated_at: this.sql`now()`
    };
    const result = await this.sql<DbSmartContract[]>`
      INSERT INTO smart_contracts ${this.sql(data)}
      ON CONFLICT ON CONSTRAINT smart_contracts_name_unique DO
        UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `;
    return result[0];
  }

  async getSmartContractQueueEntry(args: {
    smartContractId: number;
  }): Promise<FoundOrNot<DbSmartContractQueueEntry>> {
    const result = await this.sql<DbSmartContractQueueEntry[]>`
      SELECT * FROM smart_contract_queue_entries
      WHERE smart_contract_id = ${args.smartContractId}
      LIMIT 1
    `;
    if (result.count === 0) {
      return { found: false };
    }
    return { found: true, result: result[0] };
  }

  async updateToken(args: { smartContractId: number; ft: FungibleTokenResponseType }): Promise<void> {
    await this.sql.begin(async sql => {
      await sql`
        INSERT INTO fts
      `;
    });
  }

  async updateNft(args: { ft: NonFungibleTokenResponseType }): Promise<void> {
    //
  }

  async updateTokenQueueEntryStatus(args: { queueEntryId: number; status: DbQueueEntryStatus }): Promise<void> {
    await this.sql`
      UPDATE token_queue_entries
      SET status = ${args.status}
      WHERE id = ${args.queueEntryId}
    `;
  }

  async increaseTokenQueueEntryRetryCount(args: { queueEntryId: number }): Promise<number> {
    const result = await this.sql<{ retry_count: number }[]>`
      UPDATE token_queue_entries
      SET retry_count = retry_count + 1
      WHERE id = ${args.queueEntryId}
      RETURNING retry_count
    `;
    return result[0].retry_count;
  }
}

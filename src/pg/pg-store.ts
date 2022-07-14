import * as postgres from 'postgres';
import { DbSmartContract, DbSmartContractInsert, DbQueueEntryStatus, DbSmartContractQueueEntry, DbSmartContractQueueEntryInsert, DbTokenInsert, DbTokenQueueEntry, DbToken } from './types';

export class PgStore {
  private readonly sql: postgres.Sql<any>;

  constructor() {
    this.sql = postgres();
  }

  async insertSmartContract(args: { values: DbSmartContractInsert }): Promise<DbSmartContract> {
    const values = {
      ...args.values,
      created_at: this.sql`now()`,
      updated_at: this.sql`now()`
    };
    const result = await this.sql<DbSmartContract[]>`
      INSERT INTO smart_contracts ${this.sql(values)}
      ON CONFLICT ON CONSTRAINT smart_contracts_name_unique DO
        UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `;
    return result[0];
  }

  async insertSmartContractQueueEntry(args: { values: DbSmartContractQueueEntryInsert }): Promise<DbSmartContractQueueEntry> {
    const values = {
      ...args.values,
      created_at: this.sql`now()`,
      updated_at: this.sql`now()`
    };
    const result = await this.sql<DbSmartContractQueueEntry[]>`
      INSERT INTO smart_contract_queue_entries ${this.sql(values)}
      ON CONFLICT ON CONSTRAINT smart_contract_queue_entries_smart_contract_id_unique DO
        UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `;
    return result[0];
  }

  async getSmartContract(args: { id: number }): Promise<DbSmartContract | null> {
    const result = await this.sql<DbSmartContract[]>`
      SELECT * FROM smart_contracts
      WHERE id = ${args.id}
      LIMIT 1
    `;
    if (result.count === 0) {
      return null;
    }
    return result[0];
  }

  async updateSmartContractTokenCount(args: { id: number; count: number }): Promise<void> {
    await this.sql`
      UPDATE smart_contracts SET token_count = ${args.count} WHERE id = ${args.id}
    `;
  }

  async insertAndEnqueueToken(args: {
    values: DbTokenInsert
  }): Promise<{ token: DbToken, queueEntry: DbTokenQueueEntry }> {
    return await this.sql.begin(async sql => {
      const tokenResult = await sql<DbToken[]>`
        INSERT INTO tokens ${sql(args.values)}
        ON CONFLICT ON CONSTRAINT tokens_smart_contract_id_token_id_unique DO NOTHING
        RETURNING *
      `;
      const queueValues = {
        token_id: tokenResult[0].id,
        created_at: this.sql`now()`,
        updated_at: this.sql`now()`
      };
      const queueResult = await sql<DbTokenQueueEntry[]>`
        INSERT INTO token_queue_entries ${sql(queueValues)}
        ON CONFLICT ON CONSTRAINT token_queue_entries_token_id_unique DO
          UPDATE SET updated_at = EXCLUDED.updated_at
        RETURNING *
      `;
      return { token: tokenResult[0], queueEntry: queueResult[0] };
    });
  }

  // async insertTokenQueueEntry(args: { values: DbSmartContractQueueEntryInsert }): Promise<DbSmartContractQueueEntry> {

  //   return result[0];
  // }

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

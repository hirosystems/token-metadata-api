import * as postgres from 'postgres';
import {
  DbSmartContract,
  DbSmartContractInsert,
  DbQueueEntryStatus,
  DbSmartContractQueueEntry,
  DbTokenInsert,
  DbTokenQueueEntry,
  DbToken,
  DbTokenType,
  DbFtInsert,
  DbNftInsert,
  DbSftInsert
} from './types';

/**
 * Connects and queries the Token Metadata Service's local postgres DB.
 */
export class PgStore {
  private readonly sql: postgres.Sql<any>;

  constructor() {
    this.sql = postgres({ max: 1 });
  }

  async insertAndEnqueueSmartContract(args: {
    values: DbSmartContractInsert
  }): Promise<DbSmartContractQueueEntry> {
    const values = {
      ...args.values,
      created_at: this.sql`now()`,
      updated_at: this.sql`now()`
    };
    const result = await this.sql<DbSmartContractQueueEntry[]>`
      WITH smart_contract_inserts AS (
        INSERT INTO smart_contracts ${this.sql(values)}
        ON CONFLICT ON CONSTRAINT smart_contracts_principal_unique DO
          UPDATE SET updated_at = EXCLUDED.updated_at
        RETURNING id
      )
      INSERT INTO smart_contract_queue_entries (smart_contract_id, created_at, updated_at)
        (
          SELECT id AS smart_contract_id, NOW() AS created_at, NOW() AS updated_at
          FROM smart_contract_inserts
        )
      ON CONFLICT ON CONSTRAINT smart_contract_queue_entries_smart_contract_id_unique DO
        UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `;
    return result[0];
  }

  async getSmartContract(args: { id: number }): Promise<DbSmartContract | null> {
    const result = await this.sql<DbSmartContract[]>`
      SELECT * FROM smart_contracts WHERE id = ${args.id}
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

  /**
   * Returns a cursor that inserts new tokens and new token queue entries until `token_count` items
   * are created. A cursor is preferred because `token_count` could be in the tens of thousands.
   * @param args token args
   * @returns `DbTokenQueueEntry` cursor
   */
  async getInsertAndEnqueueTokensCursor(args: {
    smart_contract_id: number;
    token_count: number;
    type: DbTokenType;
  }): Promise<AsyncIterable<DbTokenQueueEntry[]>> {
    let tokenValues: DbTokenInsert[] = [];
    for (let index = 1; index <= args.token_count; index++) {
      tokenValues.push({
        smart_contract_id: args.smart_contract_id,
        token_number: index,
        type: args.type,
      });
    }
    return this.sql<DbTokenQueueEntry[]>`
      WITH token_inserts AS (
        INSERT INTO tokens ${this.sql(tokenValues)}
        ON CONFLICT ON CONSTRAINT tokens_smart_contract_id_token_number_unique DO NOTHING
        RETURNING id
      )
      INSERT INTO token_queue_entries (token_id, created_at, updated_at)
        (SELECT id AS token_id, NOW() AS created_at, NOW() AS updated_at FROM token_inserts)
      ON CONFLICT ON CONSTRAINT token_queue_entries_token_id_unique DO
        UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING *
    `.cursor(100);
  }

  async getToken(args: { id: number }): Promise<DbToken | null> {
    const result = await this.sql<DbToken[]>`
      SELECT * FROM tokens WHERE id = ${args.id}
    `;
    if (result.count === 0) {
      return null;
    }
    return result[0];
  }

  async updateToken(args: {
    id: number;
    values: DbFtInsert | DbNftInsert | DbSftInsert
  }): Promise<void> {
    await this.sql`
      UPDATE tokens SET ${this.sql(args.values)} WHERE id = ${args.id}
    `;
  }

  async updateTokenQueueEntryStatus(args: { id: number; status: DbQueueEntryStatus }): Promise<void> {
    await this.sql`
      UPDATE token_queue_entries
      SET status = ${args.status}
      WHERE id = ${args.id}
    `;
  }

  async increaseTokenQueueEntryRetryCount(args: { id: number }): Promise<number> {
    const result = await this.sql<{ retry_count: number }[]>`
      UPDATE token_queue_entries
      SET retry_count = retry_count + 1
      WHERE id = ${args.id}
      RETURNING retry_count
    `;
    return result[0].retry_count;
  }
}

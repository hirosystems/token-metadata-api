import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE smart_contract_queue_entries (
      id                  SERIAL PRIMARY KEY,
      smart_contract_id   INT NOT NULL,
      status              queue_entry_status DEFAULT 'new',
      retry_count         INT DEFAULT 0,
      created_at          TIMESTAMP NOT NULL,
      updated_at          TIMESTAMP,

      CONSTRAINT smart_contract_queue_entries_smart_contract_id_fk FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id),
      CONSTRAINT smart_contract_queue_entries_smart_contract_id_unique UNIQUE(smart_contract_id)
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE smart_contract_queue_entries`;
};

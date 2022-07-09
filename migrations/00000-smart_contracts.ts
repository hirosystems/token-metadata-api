import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE smart_contracts (
      id                  SERIAL PRIMARY KEY,
      contract_id         TEXT NOT NULL,
      sip                 INT NOT NULL,
      sender_address      TEXT NOT NULL,
      created_at          TIMESTAMP NOT NULL,
      updated_at          TIMESTAMP,
      CONSTRAINT smart_contracts_contract_id_unique UNIQUE(contract_id)
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE smart_contracts`;
};

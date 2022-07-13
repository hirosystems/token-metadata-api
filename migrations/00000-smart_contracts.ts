import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TYPE sip_number AS ENUM ('sip-009', 'sip-010', 'sip-013')`;
  await sql`CREATE TABLE smart_contracts (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      sip                 sip_number NOT NULL,
      abi                 TEXT NOT NULL,
      tx_id               TEXT NOT NULL,
      block_height        INT NOT NULL,
      token_count         INT,
      created_at          TIMESTAMP NOT NULL,
      updated_at          TIMESTAMP,

      CONSTRAINT smart_contracts_name_unique UNIQUE(name)
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE smart_contracts`;
  await sql`DROP TYPE sip_number`;
};

import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TYPE sip_number AS ENUM ('sip-009', 'sip-010', 'sip-013')`;
  await sql`CREATE TABLE smart_contracts (
    id                  SERIAL PRIMARY KEY,
    principal           TEXT NOT NULL,
    sip                 sip_number NOT NULL,
    abi                 TEXT NOT NULL,
    tx_id               TEXT NOT NULL,
    block_height        INT NOT NULL,
    token_count         INT,
    created_at          TIMESTAMP NOT NULL,
    updated_at          TIMESTAMP,

    CONSTRAINT smart_contracts_principal_unique UNIQUE(principal)
  )`;
  await sql`CREATE INDEX smart_contracts_block_height_index ON smart_contracts (block_height DESC)`;
  await sql`CREATE INDEX smart_contracts_principal_index ON smart_contracts (principal)`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX IF EXISTS smart_contracts_block_height_index`;
  await sql`DROP INDEX IF EXISTS smart_contracts_principal_index`;
  await sql`DROP TABLE IF EXISTS smart_contracts`;
  await sql`DROP TYPE IF EXISTS sip_number`;
};

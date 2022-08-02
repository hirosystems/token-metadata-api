import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TYPE token_type AS ENUM ('ft', 'nft', 'sft')`;
  await sql`CREATE TABLE tokens (
    id                    SERIAL PRIMARY KEY,
    smart_contract_id     INT NOT NULL,
    type                  token_type NOT NULL,
    token_number          INT NOT NULL,
    uri                   TEXT,
    name                  TEXT,
    symbol                TEXT,
    decimals              INT,
    total_supply          INT,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP,

    CONSTRAINT tokens_smart_contract_id_fk FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id),
    CONSTRAINT tokens_smart_contract_id_token_number_unique UNIQUE(smart_contract_id, token_number)
  )`;
  await sql`CREATE INDEX tokens_smart_contract_id_index ON tokens (smart_contract_id)`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX IF EXISTS tokens_smart_contract_id_index`;
  await sql`DROP TABLE IF EXISTS tokens`;
  await sql`DROP TYPE IF EXISTS token_type`;
};

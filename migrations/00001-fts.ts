import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE fts (
      id                  SERIAL PRIMARY KEY,
      smart_contract_id   INT NOT NULL,
      name                TEXT NOT NULL,
      symbol              TEXT NOT NULL,
      decimals            INT NOT NULL,
      total_supply        INT NOT NULL,
      token_uri           TEXT NOT NULL,
      CONSTRAINT fts_smart_contract_id_fk FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id),
      CONSTRAINT fts_smart_contract_id_unique UNIQUE(smart_contract_id)
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE fts`;
};

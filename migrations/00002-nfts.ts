import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE nfts (
      id                  SERIAL PRIMARY KEY,
      smart_contract_id   INT NOT NULL,
      token_id            INT NOT NULL,
      token_uri           TEXT NOT NULL,

      CONSTRAINT nfts_smart_contract_id_fk FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id),
      CONSTRAINT nfts_smart_contract_id_token_id_unique UNIQUE(smart_contract_id, token_id)
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE nfts`;
};

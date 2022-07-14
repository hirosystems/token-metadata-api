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

      CONSTRAINT tokens_smart_contract_id_fk FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id),

      CONSTRAINT tokens_smart_contract_id_token_number_unique UNIQUE(smart_contract_id, token_number)

      )`;
      // CONSTRAINT tokens_valid_ft_check CHECK(type <> 'ft' OR (num_nulls(name, symbol, decimals, total_supply) = 0 AND token_id = NULL)),
      // CONSTRAINT tokens_valid_nft_check CHECK(type <> 'nft' OR (num_nonnulls(name, symbol, decimals, total_supply) = 0 AND token_id <> NULL)),
      // CONSTRAINT tokens_valid_sft_check CHECK(type <> 'sft' OR num_nulls(name, symbol, decimals, total_supply, token_id) = 0)
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE tokens`;
  await sql`DROP TYPE token_type`;
};

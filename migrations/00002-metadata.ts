import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE metadata (
    id                  SERIAL PRIMARY KEY,
    token_id            INT NOT NULL,
    sip                 INT NOT NULL,
    l10n_locale         TEXT,
    l10n_uri            TEXT,
    l10n_default        BOOLEAN,
    name                TEXT,
    description         TEXT,
    image               TEXT,

    CONSTRAINT metadata_token_id_fk FOREIGN KEY(token_id) REFERENCES tokens(id)
  )`;
  await sql`CREATE INDEX metadata_token_id_index ON metadata (token_id)`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX metadata_token_id_index`;
  await sql`DROP TABLE metadata`;
};

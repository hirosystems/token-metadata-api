import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE metadata (
    id                  BIGSERIAL PRIMARY KEY,
    token_id            INT NOT NULL,
    sip                 INT NOT NULL,
    name                TEXT NOT NULL,
    l10n_locale         TEXT,
    l10n_uri            TEXT,
    l10n_default        BOOLEAN,
    description         TEXT,
    image               TEXT,
    cached_image        TEXT,

    CONSTRAINT metadata_token_id_fk FOREIGN KEY(token_id) REFERENCES tokens(id) ON DELETE CASCADE,
    CONSTRAINT metadata_token_id_l10n_locale_unique UNIQUE(token_id, l10n_locale)
  )`;
  await sql`CREATE INDEX metadata_token_id_index ON metadata (token_id)`;
  await sql`CREATE INDEX metadata_l10n_locale_index ON metadata (l10n_locale)`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX IF EXISTS metadata_token_id_index`;
  await sql`DROP INDEX IF EXISTS metadata_l10n_locale_index`;
  await sql`DROP TABLE IF EXISTS metadata`;
};

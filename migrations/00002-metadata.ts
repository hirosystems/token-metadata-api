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

      CONSTRAINT metadata_token_id_fk FOREIGN KEY(token_id) REFERENCES tokens(id),
      CONSTRAINT metadata_locale_check CHECK(num_nulls(l10n_locale, l10n_uri, l10n_default) IN (0, 3))
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE metadata`;
};

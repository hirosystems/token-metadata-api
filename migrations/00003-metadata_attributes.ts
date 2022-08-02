import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE metadata_attributes (
    id                  SERIAL PRIMARY KEY,
    metadata_id         INT NOT NULL,
    trait_type          TEXT NOT NULL,
    value               TEXT NOT NULL,
    display_type        TEXT,

    CONSTRAINT metadata_attributes_metadata_id_fk FOREIGN KEY(metadata_id) REFERENCES metadata(id) ON DELETE CASCADE
  )`;
  await sql`
    CREATE INDEX metadata_attributes_metadata_id_index ON metadata_attributes (metadata_id)
  `;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX IF EXISTS metadata_attributes_metadata_id_index`;
  await sql`DROP TABLE IF EXISTS metadata_attributes`;
};

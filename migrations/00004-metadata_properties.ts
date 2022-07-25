import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE metadata_properties (
    id                  SERIAL PRIMARY KEY,
    metadata_id         INT NOT NULL,
    name                TEXT NOT NULL,
    value               TEXT NOT NULL,

    CONSTRAINT metadata_properties_metadata_id_fk FOREIGN KEY(metadata_id) REFERENCES metadata(id)
  )`;
  await sql`
    CREATE INDEX metadata_properties_metadata_id_index ON metadata_properties (metadata_id)
  `;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX IF EXISTS metadata_properties_metadata_id_index`;
  await sql`DROP TABLE IF EXISTS metadata_properties`;
};

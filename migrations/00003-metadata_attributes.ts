import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`CREATE TABLE metadata_attributes (
      id                  SERIAL PRIMARY KEY,
      metadata_id         INT NOT NULL,
      trait_type          TEXT NOT NULL,
      value               TEXT NOT NULL,
      display_type        TEXT,

      CONSTRAINT metadata_attributes_metadata_id_fk FOREIGN KEY(metadata_id) REFERENCES metadata(id)
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE metadata_attributes`;
};

import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`
    CREATE TYPE job_status AS ENUM ('waiting', 'done', 'failed')
  `;
  await sql`CREATE TABLE jobs (
      id                  SERIAL PRIMARY KEY,
      token_id            INT,
      smart_contract_id   INT,
      status              job_status DEFAULT 'waiting',
      retry_count         INT DEFAULT 0,
      created_at          TIMESTAMP NOT NULL,
      updated_at          TIMESTAMP,

      CONSTRAINT jobs_token_id_fk FOREIGN KEY(token_id) REFERENCES tokens(id),
      CONSTRAINT jobs_smart_contract_id_fk FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id),
      CONSTRAINT jobs_token_id_smart_contract_id_unique UNIQUE(token_id, smart_contract_id)
    )`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP TABLE jobs`;
  await sql`DROP TYPE job_status`;
};

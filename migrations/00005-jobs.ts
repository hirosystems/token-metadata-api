import { Sql } from 'postgres';

export const up = async (sql: Sql<any>) => {
  await sql`
    CREATE TYPE job_status AS ENUM ('pending', 'queued', 'done', 'failed')
  `;
  await sql`CREATE TABLE jobs (
    id                  BIGSERIAL PRIMARY KEY,
    token_id            INT,
    smart_contract_id   INT,
    status              job_status DEFAULT 'pending',
    retry_count         INT DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP,

    CONSTRAINT jobs_token_id_fk FOREIGN KEY(token_id) REFERENCES tokens(id),
    CONSTRAINT jobs_smart_contract_id_fk FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id),
    CONSTRAINT jobs_token_id_smart_contract_id_unique UNIQUE(token_id, smart_contract_id)
  )`;
  await sql`CREATE INDEX jobs_pending_index ON jobs (status) WHERE status = 'pending'`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX IF EXISTS jobs_pending_index`;
  await sql`DROP TABLE IF EXISTS jobs`;
  await sql`DROP TYPE IF EXISTS job_status`;
};

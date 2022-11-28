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
    CONSTRAINT jobs_job_type_check CHECK (NUM_NONNULLS(token_id, smart_contract_id) = 1)
  )`;
  await sql`CREATE INDEX jobs_pending_index ON jobs (status) WHERE status = 'pending'`;
  await sql`CREATE UNIQUE INDEX jobs_token_id_unique ON jobs (token_id) WHERE smart_contract_id IS NULL`;
  await sql`CREATE UNIQUE INDEX jobs_smart_contract_id_unique ON jobs (smart_contract_id) WHERE token_id IS NULL`;
};

export const down = async (sql: Sql<any>) => {
  await sql`DROP INDEX IF EXISTS jobs_pending_index`;
  await sql`DROP INDEX IF EXISTS jobs_token_id_unique`;
  await sql`DROP INDEX IF EXISTS jobs_smart_contract_id_unique`;
  await sql`DROP TABLE IF EXISTS jobs`;
  await sql`DROP TYPE IF EXISTS job_status`;
};

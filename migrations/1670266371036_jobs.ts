/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('job_status', ['pending', 'queued', 'done', 'failed']);
  pgm.createTable('jobs', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    token_id: {
      type: 'int',
    },
    smart_contract_id: {
      type: 'int',
    },
    status: {
      type: 'job_status',
      default: 'pending',
    },
    retry_count: {
      type: 'int',
      default: 0,
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('(NOW())'),
      notNull: true,
    },
    updated_at: {
      type: 'timestamptz',
    },
  });
  pgm.createConstraint('jobs', 'jobs_token_id_fk', 'FOREIGN KEY(token_id) REFERENCES tokens(id)');
  pgm.createConstraint(
    'jobs',
    'jobs_smart_contract_id_fk',
    'FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id)'
  );
  pgm.createConstraint(
    'jobs',
    'jobs_job_type_check',
    'CHECK (NUM_NONNULLS(token_id, smart_contract_id) = 1)'
  );
  pgm.createIndex('jobs', ['status'], { where: "status = 'pending'" });
  pgm.createIndex('jobs', ['token_id'], { where: 'smart_contract_id IS NULL', unique: true });
  pgm.createIndex('jobs', ['smart_contract_id'], { where: 'token_id IS NULL', unique: true });
}

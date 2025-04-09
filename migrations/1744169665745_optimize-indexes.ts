/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createIndex('jobs', ['token_id']);
  pgm.createIndex('jobs', ['smart_contract_id']);
  pgm.createIndex('jobs', ['status'], { name: 'jobs_status_all_index' });
  pgm.createIndex('jobs', ['status', { name: 'updated_at', sort: 'ASC' }], {
    where: "status = 'queued'",
  });

  pgm.createIndex('tokens', ['type', 'name'], { where: "type = 'ft'" });
  pgm.createIndex('tokens', ['type', 'symbol'], { where: "type = 'ft'" });
  pgm.createIndex('tokens', ['type']);

  pgm.createIndex(
    'update_notifications',
    [
      'update_mode',
      'token_id',
      { name: 'block_height', sort: 'DESC' },
      { name: 'tx_index', sort: 'DESC' },
      { name: 'event_index', sort: 'DESC' },
    ],
    { where: "update_mode = 'dynamic'" }
  );
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('rate_limited_hosts', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    hostname: {
      type: 'text',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('(NOW())'),
      notNull: true,
    },
    retry_after: {
      type: 'timestamptz',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'rate_limited_hosts',
    'rate_limited_hosts_hostname_unique',
    'UNIQUE(hostname)'
  );
  pgm.createIndex('rate_limited_hosts', ['hostname']);
}

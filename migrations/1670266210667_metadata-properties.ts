/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('metadata_properties', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    metadata_id: {
      type: 'int',
      notNull: true,
    },
    name: {
      type: 'text',
      notNull: true,
    },
    value: {
      type: 'jsonb',
      notNull: true,
    },
  });
  pgm.createConstraint(
    'metadata_properties',
    'metadata_properties_metadata_id_fk',
    'FOREIGN KEY(metadata_id) REFERENCES metadata(id) ON DELETE CASCADE'
  );
  pgm.createIndex('metadata_properties', ['metadata_id']);
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('metadata_attributes', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    metadata_id: {
      type: 'int',
      notNull: true,
    },
    trait_type: {
      type: 'text',
      notNull: true,
    },
    value: {
      type: 'jsonb',
      notNull: true,
    },
    display_type: {
      type: 'text',
    },
  });
  pgm.createConstraint(
    'metadata_attributes',
    'metadata_attributes_metadata_id_fk',
    'FOREIGN KEY(metadata_id) REFERENCES metadata(id) ON DELETE CASCADE'
  );
  pgm.createIndex('metadata_attributes', ['metadata_id']);
}

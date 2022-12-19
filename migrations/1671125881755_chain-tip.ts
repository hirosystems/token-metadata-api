/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('chain_tip', {
    block_height: {
      type: 'int',
      notNull: true,
      default: 0,
    },
    last_dynamic_token_refresh_at: {
      type: 'timestamp',
    },
  });
  // Ensure only a single row can exist
  pgm.addConstraint('chain_tip', 'chain_tip_one_row', 'CHECK(id)');
  // Create the single row
  pgm.sql('INSERT INTO chain_tip VALUES(DEFAULT)');
}

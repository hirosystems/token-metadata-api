/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('notifications', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    smart_contract_id: {
      type: 'int',
      notNull: true,
      references: 'smart_contracts',
      onDelete: 'CASCADE',
    },
    block_height: {
      type: 'int',
      notNull: true,
    },
    index_block_hash: {
      type: 'text',
      notNull: true,
    },
    tx_id: {
      type: 'text',
      notNull: true,
    },
    tx_index: {
      type: 'int',
      notNull: true,
    },
    event_index: {
      type: 'int',
      notNull: true,
    },
    update_mode: {
      type: 'token_update_mode',
      default: 'standard',
      notNull: true,
    },
    ttl: {
      type: 'numeric',
    },
  });
  pgm.createConstraint('notifications', 'notifications_unique', {
    unique: ['block_height', 'tx_index', 'event_index'],
  });
}

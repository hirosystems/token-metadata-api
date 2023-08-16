/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('token_metadata_notifications', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    smart_contract_id: {
      type: 'int',
      notNull: true,
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
  pgm.createConstraint(
    'token_metadata_notifications',
    'token_metadata_notifications_smart_contract_id_fk',
    'FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'token_metadata_notifications',
    'token_metadata_notifications_unique',
    'UNIQUE(smart_contract_id, block_height, index_block_hash, tx_id, tx_index, event_index)'
  );

  pgm.addColumn('tokens', {
    token_metadata_notification_id: {
      type: 'int',
    },
  });
  pgm.createConstraint(
    'tokens',
    'tokens_token_metadata_notification_id_fk',
    'FOREIGN KEY(token_metadata_notification_id) REFERENCES token_metadata_notifications(id) ON UPDATE CASCADE'
  );
  pgm.createIndex('tokens', ['token_metadata_notification_id']);
}

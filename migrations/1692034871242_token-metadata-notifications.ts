/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('notifications', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    smart_contract_principal: {
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
    'notifications',
    'notifications_smart_contract_principal_fk',
    'FOREIGN KEY(smart_contract_principal) REFERENCES smart_contracts(principal) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'notifications',
    'notifications_unique',
    'UNIQUE(block_height, tx_index, event_index)'
  );

  pgm.createTable('notifications_tokens', {
    notification_id: {
      type: 'int',
      notNull: true,
    },
    token_id: {
      type: 'int',
    },
  });
  pgm.createConstraint('notifications_tokens', 'notifications_tokens_pkey', {
    primaryKey: ['notification_id', 'token_id'],
  });
  pgm.createConstraint(
    'notifications_tokens',
    'notifications_tokens_notification_id_fk',
    'FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE'
  );
  pgm.createConstraint(
    'notifications_tokens',
    'notifications_tokens_token_id_fk',
    'FOREIGN KEY(token_id) REFERENCES tokens(id) ON DELETE CASCADE'
  );
}

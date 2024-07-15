/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('notifications_tokens', {
    notification_id: {
      type: 'int',
      notNull: true,
      references: 'notifications',
      onDelete: 'CASCADE',
    },
    smart_contract_id: {
      type: 'int',
      notNull: true,
      references: 'smart_contracts',
      onDelete: 'CASCADE',
    },
    token_id: {
      type: 'int',
      references: 'tokens',
      onDelete: 'CASCADE',
    },
  });
  pgm.createIndex('notifications_tokens', ['notification_id', 'smart_contract_id', 'token_id'], {
    unique: true,
  });
}

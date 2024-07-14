/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('frozen_tokens', {
    token_id: {
      type: 'int',
      notNull: true,
      primaryKey: true,
      references: 'tokens',
      onDelete: 'CASCADE',
    },
    notification_id: {
      type: 'int',
      notNull: true,
      references: 'notifications',
      onDelete: 'CASCADE',
    },
  });
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('tokens', ['type', 'name']);
  pgm.createIndex('tokens', ['type', 'LOWER(name)'], { where: "type = 'ft'" });

  pgm.dropIndex('tokens', ['type', 'symbol']);
  pgm.createIndex('tokens', ['type', 'LOWER(symbol)'], { where: "type = 'ft'" });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('tokens', ['type', 'LOWER(name)']);
  pgm.createIndex('tokens', ['type', 'name'], { where: "type = 'ft'" });

  pgm.dropIndex('tokens', ['type', 'LOWER(symbol)']);
  pgm.createIndex('tokens', ['type', 'symbol'], { where: "type = 'ft'" });
}

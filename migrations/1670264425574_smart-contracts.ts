/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('sip_number', ['sip-009', 'sip-010', 'sip-013']);
  pgm.createTable('smart_contracts', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    principal: {
      type: 'text',
      notNull: true,
    },
    sip: {
      type: 'sip_number',
      notNull: true,
    },
    abi: {
      type: 'jsonb',
      notNull: true,
    },
    tx_id: {
      type: 'text',
      notNull: true,
    },
    block_height: {
      type: 'int',
      notNull: true,
    },
    token_count: {
      type: 'numeric',
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('(NOW())'),
      notNull: true,
    },
    updated_at: {
      type: 'timestamp',
    },
  });
  pgm.createConstraint('smart_contracts', 'smart_contracts_principal_unique', 'UNIQUE(principal)');
  pgm.createIndex('smart_contracts', [{ name: 'block_height', sort: 'DESC' }]);
  pgm.createIndex('smart_contracts', ['principal']);
}

/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('token_type', ['ft', 'nft', 'sft']);
  pgm.createType('token_update_mode', ['standard', 'frozen', 'dynamic']);
  pgm.createTable('tokens', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    smart_contract_id: {
      type: 'int',
      notNull: true,
    },
    type: {
      type: 'token_type',
      notNull: true,
    },
    token_number: {
      type: 'int',
      notNull: true,
    },
    update_mode: {
      type: 'token_update_mode',
      default: 'standard',
      notNull: true,
    },
    ttl: {
      type: 'int',
    },
    uri: {
      type: 'text',
    },
    name: {
      type: 'text',
    },
    symbol: {
      type: 'text',
    },
    decimals: {
      type: 'int',
    },
    total_supply: {
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
  pgm.createConstraint(
    'tokens',
    'tokens_smart_contract_id_fk',
    'FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id)'
  );
  pgm.createConstraint(
    'tokens',
    'tokens_smart_contract_id_token_number_unique',
    'UNIQUE(smart_contract_id, token_number)'
  );
  pgm.createIndex('tokens', ['smart_contract_id']);
}

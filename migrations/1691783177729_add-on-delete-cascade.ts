/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropConstraint('tokens', 'tokens_smart_contract_id_fk');
  pgm.createConstraint(
    'tokens',
    'tokens_smart_contract_id_fk',
    'FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id) ON DELETE CASCADE'
  );
  pgm.dropConstraint('jobs', 'jobs_token_id_fk');
  pgm.createConstraint(
    'jobs',
    'jobs_token_id_fk',
    'FOREIGN KEY(token_id) REFERENCES tokens(id) ON DELETE CASCADE'
  );
  pgm.dropConstraint('jobs', 'jobs_smart_contract_id_fk');
  pgm.createConstraint(
    'jobs',
    'jobs_smart_contract_id_fk',
    'FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id) ON DELETE CASCADE'
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint('tokens', 'tokens_smart_contract_id_fk');
  pgm.createConstraint(
    'tokens',
    'tokens_smart_contract_id_fk',
    'FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id)'
  );
  pgm.dropConstraint('jobs', 'jobs_token_id_fk');
  pgm.createConstraint('jobs', 'jobs_token_id_fk', 'FOREIGN KEY(token_id) REFERENCES tokens(id)');
  pgm.dropConstraint('jobs', 'jobs_smart_contract_id_fk');
  pgm.createConstraint(
    'jobs',
    'jobs_smart_contract_id_fk',
    'FOREIGN KEY(smart_contract_id) REFERENCES smart_contracts(id)'
  );
}

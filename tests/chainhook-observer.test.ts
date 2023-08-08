import { cvToHex, tupleCV, bufferCV } from '@stacks/transactions';
import { DbSmartContractInsert, DbSipNumber, DbTokenType } from '../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../src/env';
import { PgStore, MIGRATIONS_DIR } from '../src/pg/pg-store';
import { TestChainhookPayloadBuilder } from './helpers';

describe('Chainhook observer', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('contract deployments', () => {
    //
  });

  describe('print events', () => {
    test('applies SIP-019 notification', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;

      const values: DbSmartContractInsert = {
        principal: contractId,
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.insertAndEnqueueSmartContract({ values });
      await db.insertAndEnqueueSequentialTokens({
        smart_contract_id: 1,
        token_count: 3n, // 3 tokens
        type: DbTokenType.nft,
      });
      // Mark jobs as done to test
      await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
      const jobs1 = await db.getPendingJobBatch({ limit: 10 });
      expect(jobs1.length).toBe(0);

      await db.updatePrintEvent(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 100 })
          .transaction({ hash: '0x01' })
          .printEvent({
            type: 'SmartContractEvent',
            data: {
              contract_identifier: contractId,
              topic: 'print',
              raw_value: cvToHex(
                tupleCV({
                  notification: bufferCV(Buffer.from('token-metadata-update')),
                  payload: tupleCV({
                    'token-class': bufferCV(Buffer.from('nft')),
                    'contract-id': bufferCV(Buffer.from(contractId)),
                  }),
                })
              ),
            },
          })
          .build()
      );

      const jobs2 = await db.getPendingJobBatch({ limit: 10 });
      expect(jobs2.length).toBe(3);
    });
  });
});

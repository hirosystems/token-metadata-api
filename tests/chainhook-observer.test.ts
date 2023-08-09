import { cvToHex, tupleCV, bufferCV, listCV, uintCV, stringUtf8CV } from '@stacks/transactions';
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
    test('enqueues SIP-019 notification for all tokens', async () => {
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
          .transaction({ hash: '0x01', sender: address })
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

    test('enqueues NFT SIP-019 notification for specific tokens', async () => {
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
          .transaction({ hash: '0x01', sender: address })
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
                    'token-ids': listCV([uintCV(1), uintCV(2)]),
                  }),
                })
              ),
            },
          })
          .build()
      );

      const jobs2 = await db.getPendingJobBatch({ limit: 10 });
      expect(jobs2.length).toBe(2); // Only two tokens
      expect(jobs2[0].token_id).toBe(1);
      expect(jobs2[1].token_id).toBe(2);
    });

    test('ignores other contract log events', async () => {
      await db.updatePrintEvent(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 100 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .printEvent({
            type: 'SmartContractEvent',
            data: {
              contract_identifier: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
              topic: 'print',
              raw_value: cvToHex(stringUtf8CV('test')),
            },
          })
          .build()
      );

      const jobs = await db.getPendingJobBatch({ limit: 1 });
      expect(jobs[0]).toBeUndefined();
    });

    test('ignores SIP-019 notification for frozen tokens', async () => {
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
        token_count: 1n,
        type: DbTokenType.nft,
      });
      // Mark jobs as done to test
      await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
      const jobs1 = await db.getPendingJobBatch({ limit: 10 });
      expect(jobs1.length).toBe(0);

      // Mark token as frozen.
      await db.sql`UPDATE tokens SET update_mode = 'frozen' WHERE TRUE`;
      const token1 = await db.getToken({ id: 1 });
      expect(token1?.update_mode).toBe('frozen');

      await db.updatePrintEvent(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 100 })
          .transaction({ hash: '0x01', sender: address })
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
      expect(jobs2.length).toBe(0); // No tokens queued.
    });

    test('ignores SIP-019 notification from incorrect sender', async () => {
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
        token_count: 1n,
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
          // Incorrect sender
          .transaction({ hash: '0x01', sender: 'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A' })
          .printEvent({
            type: 'SmartContractEvent',
            data: {
              contract_identifier: 'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A.another-contract',
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
      expect(jobs2.length).toBe(0); // No tokens queued.
    });

    test('updates token refresh mode on SIP-019 notification', async () => {
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
        token_count: 1n,
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
          .transaction({ hash: '0x01', sender: address })
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
                    'update-mode': stringUtf8CV('frozen'), // Mark as frozen.
                  }),
                })
              ),
            },
          })
          .build()
      );

      const token1 = await db.getToken({ id: 1 });
      expect(token1?.update_mode).toBe('frozen');
    });

    test('enqueues SIP-013 minted token for valid contract', async () => {
      const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
      const contractId = 'key-alex-autoalex-v1';
      const values: DbSmartContractInsert = {
        principal: `${address}.${contractId}`,
        sip: DbSipNumber.sip013,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.insertAndEnqueueSmartContract({ values });

      await db.updatePrintEvent(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 100 })
          .transaction({ hash: '0x01', sender: address })
          .printEvent({
            type: 'SmartContractEvent',
            data: {
              contract_identifier: `${address}.${contractId}`,
              topic: 'print',
              raw_value: cvToHex(
                tupleCV({
                  type: bufferCV(Buffer.from('sft_mint')),
                  recipient: bufferCV(Buffer.from(address)),
                  'token-id': uintCV(3),
                  amount: uintCV(1000),
                })
              ),
            },
          })
          .build()
      );

      const token = await db.getToken({ id: 1 });
      expect(token?.type).toBe(DbTokenType.sft);
      expect(token?.token_number).toBe('3');
    });
  });
});

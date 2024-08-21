import { cvToHex, tupleCV, bufferCV, uintCV } from '@stacks/transactions';
import { DbSipNumber, DbTokenType } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContract,
  insertAndEnqueueTestContractWithTokens,
  getJobCount,
  getTokenCount,
  TestChainhookPayloadBuilder,
  markAllJobsAsDone,
} from '../helpers';

describe('SFT events', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('SFT mint enqueues minted token for valid contract', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = `${address}.key-alex-autoalex-v1`;
    await insertAndEnqueueTestContract(db, contractId, DbSipNumber.sip013);
    await markAllJobsAsDone(db);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'SmartContractEvent',
          position: { index: 0 },
          data: {
            contract_identifier: contractId,
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
    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].token_id).toBe(1);
  });

  test('rolls back SFT mint', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = 'key-alex-autoalex-v1';
    const principal = `${address}.${contractId}`;
    await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip013, 1n);
    await markAllJobsAsDone(db);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .rollback()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'SmartContractEvent',
          position: { index: 0 },
          data: {
            contract_identifier: principal,
            topic: 'print',
            raw_value: cvToHex(
              tupleCV({
                type: bufferCV(Buffer.from('sft_mint')),
                recipient: bufferCV(Buffer.from(address)),
                'token-id': uintCV(1),
                amount: uintCV(1000),
              })
            ),
          },
        })
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('0');
    await expect(getJobCount(db)).resolves.toBe('1'); // Only the smart contract job
  });
});

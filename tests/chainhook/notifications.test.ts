import { cvToHex, tupleCV, bufferCV, listCV, uintCV, stringUtf8CV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContractWithTokens,
  markAllJobsAsDone,
  TestChainhookPayloadBuilder,
} from '../helpers';

describe('token metadata notifications', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('enqueues notification for all tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
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
    const notif = await db.getTokenMetadataNotification({ tokenId: 1 });
    expect(notif).not.toBeUndefined();
  });

  test('enqueues notification for specific tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
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
    const notif = await db.getTokenMetadataNotification({ tokenId: 3 });
    expect(notif).toBeUndefined();
  });

  test('rolls back notification', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);

    // Write 2 notifications, test rollback changes ref to old notification.
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
                notification: bufferCV(Buffer.from('token-metadata-update')),
                payload: tupleCV({
                  'token-class': bufferCV(Buffer.from('nft')),
                  'contract-id': bufferCV(Buffer.from(contractId)),
                  'token-ids': listCV([uintCV(1)]),
                }),
              })
            ),
          },
        })
        .build()
    );
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 101 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'SmartContractEvent',
          position: { index: 0 },
          data: {
            contract_identifier: contractId,
            topic: 'print',
            raw_value: cvToHex(
              tupleCV({
                notification: bufferCV(Buffer.from('token-metadata-update')),
                payload: tupleCV({
                  'token-class': bufferCV(Buffer.from('nft')),
                  'contract-id': bufferCV(Buffer.from(contractId)),
                  'token-ids': listCV([uintCV(1)]),
                  'update-mode': bufferCV(Buffer.from('frozen')),
                }),
              })
            ),
          },
        })
        .build()
    );

    await markAllJobsAsDone(db);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .rollback()
        .block({ height: 101 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'SmartContractEvent',
          position: { index: 0 },
          data: {
            contract_identifier: contractId,
            topic: 'print',
            raw_value: cvToHex(
              tupleCV({
                notification: bufferCV(Buffer.from('token-metadata-update')),
                payload: tupleCV({
                  'token-class': bufferCV(Buffer.from('nft')),
                  'contract-id': bufferCV(Buffer.from(contractId)),
                  'token-ids': listCV([uintCV(1)]),
                  'update-mode': bufferCV(Buffer.from('frozen')),
                }),
              })
            ),
          },
        })
        .build()
    );
    const notif = await db.getTokenMetadataNotification({ tokenId: 1 });
    expect(notif).toBeUndefined();
  });

  test('ignores other contract log events', async () => {
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
        .event({
          type: 'SmartContractEvent',
          position: { index: 0 },
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

  test('ignores notification for frozen tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);

    // Mark as frozen
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 90 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'SmartContractEvent',
          position: { index: 0 },
          data: {
            contract_identifier: contractId,
            topic: 'print',
            raw_value: cvToHex(
              tupleCV({
                notification: bufferCV(Buffer.from('token-metadata-update')),
                payload: tupleCV({
                  'token-class': bufferCV(Buffer.from('nft')),
                  'contract-id': bufferCV(Buffer.from(contractId)),
                  'update-mode': bufferCV(Buffer.from('frozen')),
                }),
              })
            ),
          },
        })
        .build()
    );

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
    const notif = await db.getTokenMetadataNotification({ tokenId: 1 });
    expect(notif).not.toBeUndefined();
    expect(notif?.block_height).toBe(90);
    expect(notif?.update_mode).toBe('frozen'); // Keeps the old frozen notif
  });

  test('ignores notification from incorrect sender', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        // Incorrect sender
        .transaction({ hash: '0x01', sender: 'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A' })
        .event({
          type: 'SmartContractEvent',
          position: { index: 0 },
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

  test('updates token refresh mode', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
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

    const notif = await db.getTokenMetadataNotification({ tokenId: 1 });
    expect(notif?.update_mode).toBe('frozen');
  });
});

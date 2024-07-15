import { cvToHex, uintCV } from '@stacks/transactions';
import { DbSipNumber } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContractWithTokens,
  getJobCount,
  getTokenCount,
  markAllJobsAsDone,
  TestChainhookPayloadBuilder,
} from '../helpers';

describe('NFT events', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('NFT mint enqueues metadata fetch', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
    await markAllJobsAsDone(db);

    // Get 4th token via mint
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'NFTMintEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::friedger-nft`,
            recipient: address,
            raw_value: cvToHex(uintCV(4)),
          },
        })
        .build()
    );

    await expect(db.getPendingJobBatch({ limit: 10 })).resolves.toHaveLength(1);
    await expect(db.getToken({ id: 4 })).resolves.not.toBeUndefined();
  });

  test('NFT mint roll back removes token', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
    await markAllJobsAsDone(db);

    // Roll back token 3
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .rollback()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'NFTMintEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::friedger-nft`,
            recipient: address,
            raw_value: cvToHex(uintCV(3)),
          },
        })
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('2');
    await expect(getJobCount(db)).resolves.toBe('3'); // Only the contract + other token jobs
  });
});

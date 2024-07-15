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

describe('FT events', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('FT mints enqueue refresh', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'FTMintEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::friedger-nft`,
            recipient: address,
            amount: '2000',
          },
        })
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('1');
    await expect(getJobCount(db)).resolves.toBe('1');
  });

  test('FT burns enqueue refresh', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'FTBurnEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::friedger-nft`,
            sender: address,
            amount: '2000',
          },
        })
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('1');
    await expect(getJobCount(db)).resolves.toBe('1');
  });
});

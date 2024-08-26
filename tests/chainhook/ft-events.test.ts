import { DbProcessedTokenUpdateBundle, DbSipNumber, DbToken } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContractWithTokens,
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

  test('FT mints adjust token supply', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);
    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 8,
        total_supply: '10000',
        uri: null,
      },
    };
    await db.updateProcessedTokenWithMetadata({ id: 1, values: tokenValues });
    let token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('10000');

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'FTMintEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::usdc`,
            recipient: address,
            amount: '2000',
          },
        })
        .build()
    );

    token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('12000');
  });

  test('FT mints do not enqueue refresh', async () => {
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
            asset_identifier: `${contractId}::usdc`,
            recipient: address,
            amount: '2000',
          },
        })
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('1');
    // No refresh necessary, we'll only adjust the supply.
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });

  test('FT burns adjust token supply', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.usdc`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip010, 1n);
    await markAllJobsAsDone(db);
    const tokenValues: DbProcessedTokenUpdateBundle = {
      token: {
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 8,
        total_supply: '10000',
        uri: null,
      },
    };
    await db.updateProcessedTokenWithMetadata({ id: 1, values: tokenValues });
    let token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('10000');

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'FTBurnEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::usdc`,
            sender: address,
            amount: '2000',
          },
        })
        .build()
    );

    token = await db.getToken({ id: 1 });
    expect(token?.total_supply).toBe('8000');
  });

  test('FT burns do not enqueue refresh', async () => {
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
            asset_identifier: `${contractId}::usdc`,
            sender: address,
            amount: '2000',
          },
        })
        .build()
    );

    await expect(getTokenCount(db)).resolves.toBe('1');
    // No refresh necessary, we'll only adjust the supply.
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });
});

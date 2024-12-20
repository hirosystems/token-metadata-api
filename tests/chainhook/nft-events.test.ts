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
  SIP_009_ABI,
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

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].token_id).toBe(4);
    await expect(db.getToken({ id: 4 })).resolves.not.toBeUndefined();
  });

  test('NFT contract can start with zero tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 90 })
        .transaction({ hash: '0x01', sender: address })
        .contractDeploy(contractId, SIP_009_ABI)
        .build()
    );
    await db.updateSmartContractTokenCount({ id: 1, count: 0n });
    await markAllJobsAsDone(db);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'NFTMintEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::crashpunks-v2`,
            recipient: address,
            raw_value: cvToHex(uintCV(1)),
          },
        })
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].token_id).toBe(1);
    await expect(db.getToken({ id: 1 })).resolves.not.toBeUndefined();
  });

  test('NFT mint is ignored if contract does not exist', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: address })
        .event({
          type: 'NFTMintEvent',
          position: { index: 0 },
          data: {
            asset_identifier: `${contractId}::crashpunks-v2`,
            recipient: address,
            raw_value: cvToHex(uintCV(1)),
          },
        })
        .build()
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs).toHaveLength(0);
    await expect(db.getToken({ id: 1 })).resolves.toBeUndefined();
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

import { DbSipNumber, DbSmartContract } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import {
  insertAndEnqueueTestContract,
  insertAndEnqueueTestContractWithTokens,
  getJobCount,
  getTokenCount,
  SIP_009_ABI,
  TestChainhookPayloadBuilder,
} from '../helpers';
import { ProcessSmartContractJob } from '../../src/token-processor/queue/job/process-smart-contract-job';
import { ProcessTokenJob } from '../../src/token-processor/queue/job/process-token-job';

describe('contract deployments', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('enqueues valid token contract', async () => {
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
        .contractDeploy('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft', SIP_009_ABI)
        .build()
    );
    const dbContract = await db.getSmartContract({ id: 1 });
    expect(dbContract?.sip).toBe(DbSipNumber.sip009);
    expect(dbContract?.principal).toBe(
      'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft'
    );
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(1);
  });

  test('ignores token contract from a failed transaction', async () => {
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({
          hash: '0x01',
          sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
          success: false, // Failed
        })
        .contractDeploy('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft', SIP_009_ABI)
        .build()
    );
    await expect(db.getSmartContract({ id: 1 })).resolves.toBeUndefined();
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });

  test('ignores non-token contract', async () => {
    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .apply()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
        .contractDeploy('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft', {
          maps: [],
          functions: [],
          variables: [],
          fungible_tokens: [],
          non_fungible_tokens: [],
        })
        .build()
    );
    await expect(db.getSmartContract({ id: 1 })).resolves.toBeUndefined();
    await expect(db.getPendingJobBatch({ limit: 1 })).resolves.toHaveLength(0);
  });

  test('rolls back contract', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .rollback()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
        .contractDeploy('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft', SIP_009_ABI)
        .build()
    );

    // Everything is deleted.
    await expect(db.getSmartContract({ principal: contractId })).resolves.toBeUndefined();
    await expect(getTokenCount(db)).resolves.toBe('0');
    await expect(getJobCount(db)).resolves.toBe('0');
  });

  test('contract roll back handles in-flight job correctly', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const principal = `${address}.friedger-pool-nft`;
    const job = await insertAndEnqueueTestContract(db, principal, DbSipNumber.sip009);
    const contract = (await db.getSmartContract({ principal })) as DbSmartContract;

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .rollback()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
        .contractDeploy('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft', SIP_009_ABI)
        .build()
    );

    const handler = new ProcessSmartContractJob({ db, job });
    await expect(handler.work()).resolves.not.toThrow();
    await expect(handler['enqueueTokens'](contract, 1n)).resolves.not.toThrow();
  });

  test('contract roll back handles in-flight token jobs correctly', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const principal = `${address}.friedger-pool-nft`;
    const jobs = await insertAndEnqueueTestContractWithTokens(
      db,
      principal,
      DbSipNumber.sip009,
      1n
    );

    await db.chainhook.processPayload(
      new TestChainhookPayloadBuilder()
        .rollback()
        .block({ height: 100 })
        .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
        .contractDeploy('SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft', SIP_009_ABI)
        .build()
    );

    const handler = new ProcessTokenJob({ db, job: jobs[0] });
    await expect(handler.work()).resolves.not.toThrow();
    await expect(
      db.updateProcessedTokenWithMetadata({
        id: 1,
        values: {
          token: {
            name: 'test',
            symbol: 'TEST',
            decimals: 4,
            total_supply: '200',
            uri: 'http://test.com',
          },
          metadataLocales: [
            {
              metadata: {
                sip: 16,
                token_id: 1,
                name: 'test',
                l10n_locale: 'en',
                l10n_uri: 'http://test.com',
                l10n_default: true,
                description: 'test',
                image: 'http://test.com',
                cached_image: 'http://test.com',
                cached_thumbnail_image: 'http://test.com',
              },
            },
          ],
        },
      })
    ).resolves.not.toThrow();
  });
});

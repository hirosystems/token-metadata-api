import { cvToHex, tupleCV, bufferCV, listCV, uintCV, stringUtf8CV } from '@stacks/transactions';
import { DbSmartContractInsert, DbSipNumber, DbTokenType, DbSmartContract } from '../../src/pg/types';
import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store';
import { SIP_009_ABI, TestChainhookPayloadBuilder } from '../helpers';
import { ProcessSmartContractJob } from '../../src/token-processor/queue/job/process-smart-contract-job';
import { ProcessTokenJob } from '../../src/token-processor/queue/job/process-token-job';

describe('Chainhook observer', () => {
  let db: PgStore;

  const createTestTokens = async (principal: string, token_count: bigint) => {
    const values: DbSmartContractInsert = {
      principal,
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.chainhook.insertAndEnqueueSmartContract({ values });
    await db.chainhook.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count,
      type: DbTokenType.nft,
    });
  };

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('contract deployments', () => {
    test('enqueues valid token contract', async () => {
      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 100 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .contractDeploy(
            'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
            SIP_009_ABI
          )
          .build()
      );

      const dbContract = await db.getSmartContract({ id: 1 });
      expect(dbContract?.sip).toBe(DbSipNumber.sip009);
      expect(dbContract?.principal).toBe(
        'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft'
      );
      const jobs = await db.getPendingJobBatch({ limit: 1 });
      expect(jobs[0].smart_contract_id).toBe(1);
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

      const dbContract = await db.getSmartContract({ id: 1 });
      expect(dbContract).toBeUndefined();
      const jobs = await db.getPendingJobBatch({ limit: 1 });
      expect(jobs[0]).toBeUndefined();
    });

    test('rolls back contract', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      await createTestTokens(contractId, 3n);

      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .rollback()
          .block({ height: 100 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .contractDeploy(
            'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
            SIP_009_ABI
          )
          .build()
      );

      // Everything is deleted.
      const dbContract = await db.getSmartContract({ principal: contractId });
      expect(dbContract).toBeUndefined();
      const tokenCount = await db.sql<{ count: string }[]>`SELECT COUNT(*) FROM tokens`;
      expect(tokenCount[0].count).toBe('0');
      const jobCount = await db.sql<{ count: string }[]>`SELECT COUNT(*) FROM jobs`;
      expect(jobCount[0].count).toBe('0');
    });

    test('contract roll back handles in-flight job correctly', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const principal = `${address}.friedger-pool-nft`;
      const values: DbSmartContractInsert = {
        principal,
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      const job = await db.chainhook.insertAndEnqueueSmartContract({ values });
      const contract = (await db.getSmartContract({ principal })) as DbSmartContract;

      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .rollback()
          .block({ height: 100 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .contractDeploy(
            'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
            SIP_009_ABI
          )
          .build()
      );

      const handler = new ProcessSmartContractJob({ db, job });
      await expect(handler.work()).resolves.not.toThrow();
      await expect(handler['enqueueTokens'](contract, 1n)).resolves.not.toThrow();
    });

    test('contract roll back handles in-flight token jobs correctly', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const principal = `${address}.friedger-pool-nft`;
      const values: DbSmartContractInsert = {
        principal,
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.chainhook.insertAndEnqueueSmartContract({ values });
      const jobs = await db.chainhook.insertAndEnqueueSequentialTokens({
        smart_contract_id: 1,
        token_count: 1n,
        type: DbTokenType.nft,
      });

      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .rollback()
          .block({ height: 100 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .contractDeploy(
            'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
            SIP_009_ABI
          )
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
                },
              },
            ],
          },
        })
      ).resolves.not.toThrow();
    });
  });

  describe('print events', () => {
    describe('token metadata notifications', () => {
      test('enqueues notification for all tokens', async () => {
        const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
        const contractId = `${address}.friedger-pool-nft`;
        await createTestTokens(contractId, 3n);

        // Mark jobs as done to test
        await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
        const jobs1 = await db.getPendingJobBatch({ limit: 10 });
        expect(jobs1.length).toBe(0);

        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 100 })
            .transaction({ hash: '0x01', sender: address })
            .printEvent({
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
        await createTestTokens(contractId, 3n);

        // Mark jobs as done to test
        await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
        const jobs1 = await db.getPendingJobBatch({ limit: 10 });
        expect(jobs1.length).toBe(0);

        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 100 })
            .transaction({ hash: '0x01', sender: address })
            .printEvent({
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

      test('ignores other contract log events', async () => {
        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 100 })
            .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
            .printEvent({
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
        await createTestTokens(contractId, 1n);

        // Mark as frozen
        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 90 })
            .transaction({ hash: '0x01', sender: address })
            .printEvent({
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

        // Mark jobs as done to test
        await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
        const jobs1 = await db.getPendingJobBatch({ limit: 10 });
        expect(jobs1.length).toBe(0);

        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 100 })
            .transaction({ hash: '0x01', sender: address })
            .printEvent({
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
        await createTestTokens(contractId, 1n);

        // Mark jobs as done to test
        await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
        const jobs1 = await db.getPendingJobBatch({ limit: 10 });
        expect(jobs1.length).toBe(0);

        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 100 })
            // Incorrect sender
            .transaction({ hash: '0x01', sender: 'SP29BPZ6BD5D8509Y9VP70J0V7VKKDDFCRPHA0T6A' })
            .printEvent({
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
        await createTestTokens(contractId, 1n);

        // Mark jobs as done to test
        await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
        const jobs1 = await db.getPendingJobBatch({ limit: 10 });
        expect(jobs1.length).toBe(0);

        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 100 })
            .transaction({ hash: '0x01', sender: address })
            .printEvent({
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

    describe('SFT mints', () => {
      test('enqueues minted token for valid contract', async () => {
        const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
        const contractId = 'key-alex-autoalex-v1';
        const values: DbSmartContractInsert = {
          principal: `${address}.${contractId}`,
          sip: DbSipNumber.sip013,
          abi: '"some"',
          tx_id: '0x123456',
          block_height: 1,
        };
        await db.chainhook.insertAndEnqueueSmartContract({ values });

        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .apply()
            .block({ height: 100 })
            .transaction({ hash: '0x01', sender: address })
            .printEvent({
              type: 'SmartContractEvent',
              position: { index: 0 },
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

      test('rolls back mint', async () => {
        const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
        const contractId = 'key-alex-autoalex-v1';
        const principal = `${address}.${contractId}`;
        const values: DbSmartContractInsert = {
          principal,
          sip: DbSipNumber.sip013,
          abi: '"some"',
          tx_id: '0x123456',
          block_height: 1,
        };
        await db.chainhook.insertAndEnqueueSmartContract({ values });
        const contract = await db.getSmartContract({ principal });
        await db.chainhook.insertAndEnqueueTokens([
          {
            smart_contract_id: contract?.id ?? 0,
            type: DbTokenType.sft,
            token_number: '200',
          },
        ]);

        await db.chainhook.processPayload(
          new TestChainhookPayloadBuilder()
            .rollback()
            .block({ height: 100 })
            .transaction({ hash: '0x01', sender: address })
            .printEvent({
              type: 'SmartContractEvent',
              position: { index: 0 },
              data: {
                contract_identifier: principal,
                topic: 'print',
                raw_value: cvToHex(
                  tupleCV({
                    type: bufferCV(Buffer.from('sft_mint')),
                    recipient: bufferCV(Buffer.from(address)),
                    'token-id': uintCV(200),
                    amount: uintCV(1000),
                  })
                ),
              },
            })
            .build()
        );

        const tokenCount = await db.sql<{ count: string }[]>`SELECT COUNT(*) FROM tokens`;
        expect(tokenCount[0].count).toBe('0');
        const jobCount = await db.sql<{ count: string }[]>`SELECT COUNT(*) FROM jobs`;
        expect(jobCount[0].count).toBe('1'); // Only the smart contract job
      });
    });
  });

  describe('chain tip', () => {
    test('updates chain tip on chainhook event', async () => {
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
      await expect(db.getChainTipBlockHeight()).resolves.toBe(100);

      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 101 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .printEvent({
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
      await expect(db.getChainTipBlockHeight()).resolves.toBe(101);
    });

    test('keeps only the highest chain tip value', async () => {
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
      await expect(db.getChainTipBlockHeight()).resolves.toBe(100);

      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 65 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .printEvent({
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
      await expect(db.getChainTipBlockHeight()).resolves.toBe(100);
    });

    test('enqueues dynamic tokens for refresh with standard interval', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 86400;
      await createTestTokens(contractId, 1n);
      // Mark as dynamic
      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 90 })
          .transaction({ hash: '0x01', sender: address })
          .printEvent({
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
                    'update-mode': bufferCV(Buffer.from('dynamic')),
                  }),
                })
              ),
            },
          })
          .build()
      );
      // Set updated_at for testing.
      await db.sql`
        UPDATE tokens
        SET updated_at = NOW() - INTERVAL '2 days'
        WHERE id = 1
      `;
      // Mark jobs as done.
      await db.sql`UPDATE jobs SET status = 'done'`;

      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 65 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .printEvent({
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

      const job = await db.getJob({ id: 2 });
      expect(job?.status).toBe('pending');
    });

    test('enqueues dynamic tokens for refresh with ttl', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
      const values: DbSmartContractInsert = {
        principal: contractId,
        sip: DbSipNumber.sip009,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1,
      };
      await db.chainhook.insertAndEnqueueSmartContract({ values });
      await db.chainhook.insertAndEnqueueSequentialTokens({
        smart_contract_id: 1,
        token_count: 1n,
        type: DbTokenType.nft,
      });
      // Mark as dynamic
      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 90 })
          .transaction({ hash: '0x01', sender: address })
          .printEvent({
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
                    'update-mode': bufferCV(Buffer.from('dynamic')),
                    ttl: uintCV(3600),
                  }),
                })
              ),
            },
          })
          .build()
      );
      // Set updated_at for testing
      await db.sql`
        UPDATE tokens
        SET updated_at = NOW() - INTERVAL '2 hours'
        WHERE id = 1
      `;
      // Mark jobs as done.
      await db.sql`UPDATE jobs SET status = 'done'`;

      await db.chainhook.processPayload(
        new TestChainhookPayloadBuilder()
          .apply()
          .block({ height: 65 })
          .transaction({ hash: '0x01', sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60' })
          .printEvent({
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

      const job = await db.getJob({ id: 2 });
      expect(job?.status).toBe('pending');
    });
  });
});

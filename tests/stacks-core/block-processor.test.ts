import { strict as assert } from 'node:assert';
import { cvToHex, tupleCV, bufferCV, uintCV, stringUtf8CV } from '@stacks/transactions';
import { DbSipNumber, DbTokenUpdateMode } from '../../src/pg/types.js';
import { cycleMigrations } from '@stacks/api-toolkit';
import { ENV } from '../../src/env.js';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store.js';
import {
  insertAndEnqueueTestContractWithTokens,
  insertTestUpdateNotification,
  markAllJobsAsDone,
  TestTransactionBuilder,
  TestBlockBuilder,
  setupEnv,
} from '../helpers.js';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('block processor', () => {
  let db: PgStore;
  let processor: StacksCoreBlockProcessor;

  beforeEach(async () => {
    setupEnv();
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
    processor = new StacksCoreBlockProcessor({ db: db.core });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('chain tip', () => {
    test('updates chain tip on stacks core block', async () => {
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 100,
          index_block_hash: '0x000001',
          parent_index_block_hash: '0x000000',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
            }).build()
          )
          .build()
      );
      assert.deepStrictEqual(await db.core.getChainTip(db.sql), {
        index_block_hash: '0x000001',
        block_height: 100,
        canonical: true,
        parent_index_block_hash: '0x000000',
      });

      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 101,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
            }).build()
          )
          .build()
      );
      assert.deepStrictEqual(await db.core.getChainTip(db.sql), {
        index_block_hash: '0x000002',
        block_height: 101,
        canonical: true,
        parent_index_block_hash: '0x000001',
      });
    });

    test('enqueues dynamic tokens for refresh with standard interval', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 86400;
      await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
      // Mark as dynamic
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 2,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: address,
            })
              .addContractEvent(
                contractId,
                cvToHex(
                  tupleCV({
                    notification: bufferCV(Buffer.from('token-metadata-update')),
                    payload: tupleCV({
                      'token-class': bufferCV(Buffer.from('nft')),
                      'contract-id': bufferCV(Buffer.from(contractId)),
                      'update-mode': bufferCV(Buffer.from('dynamic')),
                    }),
                  })
                )
              )
              .build()
          )
          .build()
      );
      // Set updated_at for testing.
      await db.sql`
        UPDATE tokens
        SET updated_at = NOW() - INTERVAL '2 days'
        WHERE id = 1
      `;
      await markAllJobsAsDone(db);

      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 3,
          index_block_hash: '0x000003',
          parent_index_block_hash: '0x000002',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
            })
              .addContractEvent(
                'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
                cvToHex(stringUtf8CV('test'))
              )
              .build()
          )
          .build()
      );

      const job = await db.getJob({ id: 2 });
      assert.strictEqual(job?.status, 'pending');
    });

    test('enqueues dynamic tokens for refresh with ttl', async () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;
      ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
      await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
      // Mark as dynamic
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 2,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: address,
            })
              .addContractEvent(
                contractId,
                cvToHex(
                  tupleCV({
                    notification: bufferCV(Buffer.from('token-metadata-update')),
                    payload: tupleCV({
                      'token-class': bufferCV(Buffer.from('nft')),
                      'contract-id': bufferCV(Buffer.from(contractId)),
                      'update-mode': bufferCV(Buffer.from('dynamic')),
                      ttl: uintCV(3600),
                    }),
                  })
                )
              )
              .build()
          )
          .build()
      );
      // Set updated_at for testing
      await db.sql`
        UPDATE tokens
        SET updated_at = NOW() - INTERVAL '2 hours'
        WHERE id = 1
      `;
      await markAllJobsAsDone(db);

      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 3,
          index_block_hash: '0x000003',
          parent_index_block_hash: '0x000002',
        })
          .addTransaction(
            new TestTransactionBuilder({
              tx_id: '0x01',
              sender: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
            })
              .addContractEvent(
                'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
                cvToHex(stringUtf8CV('test'))
              )
              .build()
          )
          .build()
      );

      const job = await db.getJob({ id: 2 });
      assert.strictEqual(job?.status, 'pending');
    });

    describe('dynamic token refresh', () => {
      const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
      const contractId = `${address}.friedger-pool-nft`;

      /** Processes a block with an unrelated event so the refresh scheduler runs. */
      async function processNextBlock() {
        await processor.processBlock(
          new TestBlockBuilder({
            block_height: 2,
            index_block_hash: '0x000002',
            parent_index_block_hash: '0x000001',
          })
            .addTransaction(
              new TestTransactionBuilder({ tx_id: '0x01', sender: address })
                .addContractEvent(contractId, cvToHex(stringUtf8CV('test')))
                .build()
            )
            .build()
        );
      }

      async function getTokenJobStatuses(): Promise<string[]> {
        const result = await db.sql<{ status: string }[]>`
          SELECT status FROM jobs WHERE token_id IS NOT NULL ORDER BY token_id ASC
        `;
        return result.map(r => r.status);
      }

      test('enqueues every dynamic token that is due for refresh', async () => {
        ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
        await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 3n);
        for (const token_id of [1, 2, 3])
          await insertTestUpdateNotification(db, {
            token_id,
            update_mode: DbTokenUpdateMode.dynamic,
            ttl: 3600,
          });
        await db.sql`UPDATE tokens SET updated_at = NOW() - INTERVAL '2 hours'`;
        await markAllJobsAsDone(db);

        await processNextBlock();

        assert.deepStrictEqual(await getTokenJobStatuses(), ['pending', 'pending', 'pending']);
      });

      test('does not refresh tokens whose latest update mode is no longer dynamic', async () => {
        ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
        await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 2n);
        for (const token_id of [1, 2])
          await insertTestUpdateNotification(db, {
            token_id,
            update_mode: DbTokenUpdateMode.dynamic,
            ttl: 3600,
            event_index: 0,
          });
        // Token 1 is frozen afterwards, token 2 stays dynamic.
        await insertTestUpdateNotification(db, {
          token_id: 1,
          update_mode: DbTokenUpdateMode.frozen,
          event_index: 1,
        });
        await db.sql`UPDATE tokens SET updated_at = NOW() - INTERVAL '2 hours'`;
        await markAllJobsAsDone(db);

        await processNextBlock();

        assert.deepStrictEqual(await getTokenJobStatuses(), ['done', 'pending']);
      });

      test('refreshes tokens that became dynamic after another update mode', async () => {
        ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
        await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
        await insertTestUpdateNotification(db, {
          token_id: 1,
          update_mode: DbTokenUpdateMode.standard,
          event_index: 0,
        });
        await insertTestUpdateNotification(db, {
          token_id: 1,
          update_mode: DbTokenUpdateMode.dynamic,
          ttl: 3600,
          event_index: 1,
        });
        await db.sql`UPDATE tokens SET updated_at = NOW() - INTERVAL '2 hours'`;
        await markAllJobsAsDone(db);

        await processNextBlock();

        assert.deepStrictEqual(await getTokenJobStatuses(), ['pending']);
      });

      test('tolerates a ttl large enough to overflow an interval', async () => {
        ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 99999;
        await insertAndEnqueueTestContractWithTokens(db, contractId, DbSipNumber.sip009, 1n);
        await insertTestUpdateNotification(db, {
          token_id: 1,
          update_mode: DbTokenUpdateMode.dynamic,
          ttl: 99999999999999,
        });
        await db.sql`UPDATE tokens SET updated_at = NOW() - INTERVAL '2 hours'`;
        await markAllJobsAsDone(db);

        await processNextBlock();

        assert.deepStrictEqual(await getTokenJobStatuses(), ['done']);
      });
    });
  });
});

import { strict as assert } from 'node:assert';
import { cvToHex, tupleCV, bufferCV, uintCV } from '@stacks/transactions';
import { DbSipNumber, DbTokenType } from '../../src/pg/types.js';
import { cycleMigrations } from '@stacks/api-toolkit';
import { PgStore, MIGRATIONS_DIR } from '../../src/pg/pg-store.js';
import {
  insertAndEnqueueTestContract,
  TestTransactionBuilder,
  TestBlockBuilder,
  markAllJobsAsDone,
  setupEnv,
} from '../helpers.js';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor.js';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('sft events', () => {
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

  test('SFT mint enqueues minted token for valid contract', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = `${address}.key-alex-autoalex-v1`;
    await insertAndEnqueueTestContract(db, contractId, DbSipNumber.sip013);
    await markAllJobsAsDone(db);

    await processor.processBlock(
      new TestBlockBuilder({
        block_height: 2,
        index_block_hash: '0x000002',
        parent_index_block_hash: '0x000001',
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: '0x01', sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  type: bufferCV(Buffer.from('sft_mint')),
                  recipient: bufferCV(Buffer.from(address)),
                  'token-id': uintCV(3),
                  amount: uintCV(1000),
                })
              )
            )
            // Try a duplicate of the same token but different amount
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  type: bufferCV(Buffer.from('sft_mint')),
                  recipient: bufferCV(Buffer.from(address)),
                  'token-id': uintCV(3),
                  amount: uintCV(200),
                })
              )
            )
            .build()
        )
        .build()
    );

    const token = await db.getToken({ id: 1 });
    assert.strictEqual(token?.type, DbTokenType.sft);
    assert.strictEqual(token?.token_number, '3');
    const jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].token_id, 1);
  });

  test('SFT re-mint keeps already fetched metadata and re-enqueues the token', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = `${address}.key-alex-autoalex-v1`;
    await insertAndEnqueueTestContract(db, contractId, DbSipNumber.sip013);
    await markAllJobsAsDone(db);

    const mintBlock = (height: number, hash: string, parentHash: string, txId: string) =>
      new TestBlockBuilder({
        block_height: height,
        index_block_hash: hash,
        parent_index_block_hash: parentHash,
      })
        .addTransaction(
          new TestTransactionBuilder({ tx_id: txId, sender: address })
            .addContractEvent(
              contractId,
              cvToHex(
                tupleCV({
                  type: bufferCV(Buffer.from('sft_mint')),
                  recipient: bufferCV(Buffer.from(address)),
                  'token-id': uintCV(3),
                  amount: uintCV(1000),
                })
              )
            )
            .build()
        )
        .build();

    await processor.processBlock(mintBlock(2, '0x000002', '0x000001', '0x01'));

    // Pretend the token's job already ran and wrote its metadata.
    await db.sql`
      UPDATE tokens
      SET uri = 'https://example.com/3.json', name = 'Test Token', symbol = 'TEST', decimals = 6,
        total_supply = '1000'
      WHERE id = 1
    `;
    await markAllJobsAsDone(db);

    // The same token mints again in a later block.
    await processor.processBlock(mintBlock(3, '0x000003', '0x000002', '0x02'));

    const token = await db.getToken({ id: 1 });
    assert.strictEqual(token?.uri, 'https://example.com/3.json');
    assert.strictEqual(token?.name, 'Test Token');
    assert.strictEqual(token?.symbol, 'TEST');
    assert.strictEqual(token?.decimals, 6);
    assert.strictEqual(token?.total_supply, '1000');

    // ...but it's queued for a refresh, since the metadata behind that URI may have changed.
    const jobs = await db.getPendingJobBatch({ limit: 1 });
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].token_id, 1);
  });
});

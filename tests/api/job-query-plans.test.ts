import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { bufferCV, cvToHex, tupleCV, uintCV } from '@stacks/transactions';
import { cycleMigrations } from '@stacks/api-toolkit';
import { buildAdminRpcServer } from '../../src/admin-rpc/init.js';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store.js';
import { DbSipNumber, DbTokenUpdateMode } from '../../src/pg/types.js';
import { StacksCoreBlockProcessor } from '../../src/stacks-core/stacks-core-block-processor.js';
import { JobQueue } from '../../src/token-processor/queue/job-queue.js';
import {
  insertAndEnqueueTestContractWithTokens,
  insertTestUpdateNotification,
  markAllJobsAsDone,
  setupEnv,
  SIP_009_ABI,
  SIP_010_ABI,
  TestBlockBuilder,
  TestTransactionBuilder,
} from '../helpers.js';

/**
 * The only indexes on each of the `jobs` reference columns. Each is partial on the other two
 * columns being NULL, so a query has to repeat that predicate for the planner to use it.
 */
const TOKEN_JOB_INDEX = 'jobs_token_id_unique_index';
const SUPPLY_JOB_INDEX = 'jobs_token_supply_id_unique_index';
const CONTRACT_JOB_INDEX = 'jobs_smart_contract_id_unique_index';

type CapturedQuery = { query: string; parameters: unknown[] };
type PlanNode = {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
};

/**
 * Runs `fn` while capturing every statement the store sends to postgres that reads or updates
 * existing jobs, so we explain the store's real SQL instead of a copy of it.
 */
async function captureJobQueries(
  db: PgStore,
  fn: () => Promise<unknown>
): Promise<CapturedQuery[]> {
  const captured: CapturedQuery[] = [];
  const options = db.sql.options;
  const debug = options.debug;
  options.debug = (_connection, query, parameters) => {
    if (/\b(FROM|JOIN|UPDATE) jobs\b/.test(query)) captured.push({ query, parameters });
  };
  try {
    await fn();
  } finally {
    options.debug = debug;
  }
  return captured;
}

/**
 * Explains a captured query with sequential scans disabled. On a tiny test table the planner would
 * pick a seq scan anyway, but with them disabled it only falls back to one (or to a full scan of
 * another index) when the expected job index can't be used for the query at all.
 */
async function explain(db: PgStore, captured: CapturedQuery): Promise<PlanNode> {
  return await db.sql.begin(async sql => {
    await sql`SET LOCAL enable_seqscan = off`;
    const result = await sql.unsafe<{ 'QUERY PLAN': { Plan: PlanNode }[] }[]>(
      `EXPLAIN (FORMAT JSON) ${captured.query}`,
      captured.parameters as never[]
    );
    return result[0]['QUERY PLAN'][0].Plan;
  });
}

function flattenPlan(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flattenPlan)];
}

/**
 * Asserts that `captured` holds one query per entry of `expectedIndexes`, in order, and that every
 * scan of `jobs` in each query's plan goes through that query's expected index.
 */
async function assertUsesJobIndexes(
  db: PgStore,
  captured: CapturedQuery[],
  expectedIndexes: string[]
) {
  // Guard against the capture silently matching nothing and the test passing vacuously.
  assert.strictEqual(
    captured.length,
    expectedIndexes.length,
    captured.map(c => c.query).join('\n---\n')
  );
  for (const [i, c] of captured.entries()) {
    const expected = expectedIndexes[i];
    const plan = await explain(db, c);
    const jobScans = flattenPlan(plan).filter(
      n => n['Relation Name'] === 'jobs' && n['Node Type'] !== 'ModifyTable'
    );
    assert.ok(jobScans.length > 0, `no scan of jobs in plan for:\n${c.query}`);
    for (const scan of jobScans) {
      // A bitmap heap scan names its index on its bitmap index scan children.
      const indexes =
        scan['Node Type'] === 'Bitmap Heap Scan'
          ? flattenPlan(scan).flatMap(n => (n['Index Name'] ? [n['Index Name']] : []))
          : [scan['Index Name']];
      assert.ok(
        indexes.length > 0 && indexes.every(i => i === expected),
        `expected ${scan['Node Type']} on jobs to use ${expected}, got ${indexes.join(', ') || 'no index'}\n` +
          `query:\n${c.query}\nplan:\n${JSON.stringify(plan, null, 2)}`
      );
    }
  }
}

describe('job query plans', () => {
  const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
  const principal = `${address}.test-nft`;
  let db: PgStore;

  beforeEach(async () => {
    setupEnv();
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('token cache info uses token job index', async () => {
    await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);
    const captured = await captureJobQueries(db, async () => {
      const cache = await db.getTokenCacheInfo({ contractPrincipal: principal, tokenNumber: 1n });
      assert.notStrictEqual(cache, undefined);
    });
    await assertUsesJobIndexes(db, captured, [TOKEN_JOB_INDEX]);
  });

  test('token metadata bundle uses contract and token job indexes', async () => {
    await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip009, 1n);
    await markAllJobsAsDone(db);
    const captured = await captureJobQueries(db, async () => {
      const bundle = await db.getTokenMetadataBundle({
        contractPrincipal: principal,
        tokenNumber: 1,
      });
      assert.strictEqual(bundle.token.token_number, '1');
    });
    await assertUsesJobIndexes(db, captured, [CONTRACT_JOB_INDEX, TOKEN_JOB_INDEX]);
  });

  test('admin token refresh uses token job index', async () => {
    await insertAndEnqueueTestContractWithTokens(db, principal, DbSipNumber.sip009, 2n);
    await markAllJobsAsDone(db);
    const jobQueue = new JobQueue({ db, network: 'mainnet' });
    const fastify = await buildAdminRpcServer({ db, jobQueue });
    try {
      const captured = await captureJobQueries(db, async () => {
        for (const tokenIds of [[1], undefined]) {
          const response = await fastify.inject({
            url: '/metadata/admin/refresh-token',
            method: 'POST',
            payload: JSON.stringify({ contractId: principal, tokenIds }),
            headers: { 'content-type': 'application/json' },
          });
          assert.strictEqual(response.statusCode, 200);
        }
      });
      await assertUsesJobIndexes(db, captured, [TOKEN_JOB_INDEX, TOKEN_JOB_INDEX]);
    } finally {
      await fastify.close();
    }
  });

  test('dynamic token refresh uses token job index', async () => {
    const [job] = await insertAndEnqueueTestContractWithTokens(
      db,
      principal,
      DbSipNumber.sip009,
      1n
    );
    await markAllJobsAsDone(db);
    await insertTestUpdateNotification(db, {
      token_id: job.token_id as number,
      update_mode: DbTokenUpdateMode.dynamic,
      ttl: 1,
    });
    await db.sql`UPDATE tokens SET updated_at = NOW() - INTERVAL '1 hour'`;
    const processor = new StacksCoreBlockProcessor({ db: db.core });
    const captured = await captureJobQueries(db, async () => {
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 2,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        }).build()
      );
    });
    const [refreshed] = await db.sql<{ status: string }[]>`
      SELECT status FROM jobs WHERE token_id = ${job.token_id as number}
    `;
    assert.strictEqual(refreshed.status, 'pending');
    await assertUsesJobIndexes(db, captured, [TOKEN_JOB_INDEX]);
  });

  test('token metadata update notification uses token job index', async () => {
    const [job] = await insertAndEnqueueTestContractWithTokens(
      db,
      principal,
      DbSipNumber.sip009,
      1n
    );
    await markAllJobsAsDone(db);
    const processor = new StacksCoreBlockProcessor({ db: db.core });
    const captured = await captureJobQueries(db, async () => {
      await processor.processBlock(
        new TestBlockBuilder({
          block_height: 2,
          index_block_hash: '0x000002',
          parent_index_block_hash: '0x000001',
        })
          .addTransaction(
            new TestTransactionBuilder({ tx_id: '0x02', sender: address })
              .addContractEvent(
                principal,
                cvToHex(
                  tupleCV({
                    notification: bufferCV(Buffer.from('token-metadata-update')),
                    payload: tupleCV({
                      'token-class': bufferCV(Buffer.from('nft')),
                      'contract-id': bufferCV(Buffer.from(principal)),
                    }),
                  })
                )
              )
              .build()
          )
          .build()
      );
    });
    const [refreshed] = await db.sql<{ status: string }[]>`
      SELECT status FROM jobs WHERE token_id = ${job.token_id as number}
    `;
    assert.strictEqual(refreshed.status, 'pending');
    // The notification's refresh, then the dynamic token refresh every block runs.
    assert.match(captured[0].query, /new_mode_inserts/);
    await assertUsesJobIndexes(db, captured, [TOKEN_JOB_INDEX, TOKEN_JOB_INDEX]);
  });

  test('re-org refresh uses supply, token and contract job indexes', async () => {
    const ftPrincipal = `${address}.test-ft`;
    const processor = new StacksCoreBlockProcessor({ db: db.core });
    const block = (height: number, hash: string, parent: string, tx?: TestTransactionBuilder) => {
      const builder = new TestBlockBuilder({
        block_height: height,
        index_block_hash: hash,
        parent_index_block_hash: parent,
      });
      if (tx) builder.addTransaction(tx.build());
      return builder.build();
    };
    await processor.processBlock(
      block(
        1,
        '0x0001',
        '0x0000',
        new TestTransactionBuilder({ tx_id: '0x01', sender: address }).setSmartContractPayload(
          'test-ft',
          SIP_010_ABI
        )
      )
    );
    // FT contracts need their token record before supply deltas can be tracked.
    const ftContract = await db.getSmartContract({ principal: ftPrincipal });
    assert.ok(ftContract);
    await db.core.insertAndEnqueueSequentialTokens(db.sql, {
      smart_contract: ftContract,
      token_count: 1n,
    });
    await db.sql`UPDATE tokens SET total_supply = 0 WHERE smart_contract_id = ${ftContract.id}`;
    // Block 2 deploys a contract, mints an NFT from it and changes the FT's supply, so re-applying
    // it refreshes one of each kind of job.
    await processor.processBlock(
      block(
        2,
        '0x02aa',
        '0x0001',
        new TestTransactionBuilder({ tx_id: '0x02', sender: address })
          .setSmartContractPayload('test-nft', SIP_009_ABI)
          .addNftMintEvent(`${principal}::crashpunks-v2`, address, cvToHex(uintCV(1)))
          .addFtMintEvent(`${ftPrincipal}::ft-token`, address, '1000')
      )
    );
    // Fork away from block 2, then back onto it so its entities become canonical again.
    await processor.processBlock(block(2, '0x02bb', '0x0001'));
    const captured = await captureJobQueries(db, async () => {
      await processor.processBlock(block(3, '0x03aa', '0x02aa'));
    });
    // The re-org's supply, token and contract refreshes, then the dynamic token refresh every
    // block runs.
    assert.match(captured[0].query, /WHERE token_supply_id IN/);
    assert.match(captured[1].query, /WHERE token_id IN/);
    assert.match(captured[2].query, /WHERE smart_contract_id IN/);
    await assertUsesJobIndexes(db, captured, [
      SUPPLY_JOB_INDEX,
      TOKEN_JOB_INDEX,
      CONTRACT_JOB_INDEX,
      TOKEN_JOB_INDEX,
    ]);
  });
});

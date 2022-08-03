import { cvToHex, uintCV } from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbSmartContractInsert, DbToken, DbTokenType } from '../src/pg/types';
import { ProcessSmartContractJob } from '../src/token-processor/process-smart-contract-job';
import { ENV } from '../src/env';
import { cycleMigrations } from './helpers';

describe('ProcessSmartContractJob', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = new PgStore();
    await cycleMigrations();
  });

  test('enqueues 1 token per FT contract', async () => {
    const values: DbSmartContractInsert = {
      principal: 'ABCD.test-ft',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1
    };
    const job = await db.insertAndEnqueueSmartContract({ values });
    const processor = new ProcessSmartContractJob({ db, job });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT * FROM tokens`;
    expect(tokens.count).toBe(1);
    expect(tokens[0].type).toBe(DbTokenType.ft);
    expect(tokens[0].smart_contract_id).toBe(1);
  });

  test('enqueues all tokens per NFT contract', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent.get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
      .intercept({
        path: '/v2/contracts/call-read/ABCD/test-nft/get-last-token-id',
        method: 'POST',
      })
      .reply(200, {
        okay: true,
        result: cvToHex(uintCV(5))
      });
    setGlobalDispatcher(agent);

    const values: DbSmartContractInsert = {
      principal: 'ABCD.test-nft',
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1
    };
    const job = await db.insertAndEnqueueSmartContract({ values });
    const processor = new ProcessSmartContractJob({ db, job });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT * FROM tokens`;
    expect(tokens.count).toBe(5);
    expect(tokens[0].type).toBe(DbTokenType.nft);
    expect(tokens[0].smart_contract_id).toBe(1);
  });

  afterEach(async () => {
    await db.close();
  });
});

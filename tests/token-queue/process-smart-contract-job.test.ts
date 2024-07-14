import { bufferCV, cvToHex, tupleCV, uintCV } from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import {
  DbSipNumber,
  DbSmartContractInsert,
  DbToken,
  DbTokenType,
  TOKENS_COLUMNS,
} from '../../src/pg/types';
import { ProcessSmartContractJob } from '../../src/token-processor/queue/job/process-smart-contract-job';
import { ENV } from '../../src/env';
import { cycleMigrations } from '@hirosystems/api-toolkit';

describe('ProcessSmartContractJob', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('enqueues 1 token per FT contract', async () => {
    const values: DbSmartContractInsert = {
      principal: 'ABCD.test-ft',
      sip: DbSipNumber.sip010,
      tx_id: '0x123456',
      block_height: 1,
    };
    const job = await db.chainhook.insertAndEnqueueSmartContract({ values });
    const processor = new ProcessSmartContractJob({
      db,
      job,
    });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT ${db.sql(TOKENS_COLUMNS)} FROM tokens`;
    expect(tokens.count).toBe(1);
    expect(tokens[0].type).toBe(DbTokenType.ft);
    expect(tokens[0].smart_contract_id).toBe(1);
  });

  test('enqueues all tokens per NFT contract', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
      .intercept({
        path: '/v2/contracts/call-read/ABCD/test-nft/get-last-token-id',
        method: 'POST',
      })
      .reply(200, {
        okay: true,
        result: cvToHex(uintCV(5)),
      });
    setGlobalDispatcher(agent);

    const values: DbSmartContractInsert = {
      principal: 'ABCD.test-nft',
      sip: DbSipNumber.sip009,
      tx_id: '0x123456',
      block_height: 1,
    };
    const job = await db.chainhook.insertAndEnqueueSmartContract({ values });
    const processor = new ProcessSmartContractJob({
      db,
      job,
    });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT ${db.sql(TOKENS_COLUMNS)} FROM tokens`;
    expect(tokens.count).toBe(5);
    expect(tokens[0].type).toBe(DbTokenType.nft);
    expect(tokens[0].smart_contract_id).toBe(1);
  });

  test('ignores NFT contract that exceeds max token count', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    agent
      .get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
      .intercept({
        path: '/v2/contracts/call-read/ABCD/test-nft/get-last-token-id',
        method: 'POST',
      })
      .reply(200, {
        okay: true,
        result: cvToHex(uintCV(10000000000)),
      });
    setGlobalDispatcher(agent);

    const values: DbSmartContractInsert = {
      principal: 'ABCD.test-nft',
      sip: DbSipNumber.sip009,
      tx_id: '0x123456',
      block_height: 1,
    };
    const job = await db.chainhook.insertAndEnqueueSmartContract({ values });
    const processor = new ProcessSmartContractJob({
      db,
      job,
    });
    await processor.work();

    const tokens = await db.sql<DbToken[]>`SELECT ${db.sql(TOKENS_COLUMNS)} FROM tokens`;
    expect(tokens.count).toBe(0);
  });

  // test('enqueues minted tokens for SFT contract', async () => {
  //   const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
  //   const contractId = `${address}.key-alex-autoalex-v1`;

  //   const values: DbSmartContractInsert = {
  //     principal: contractId,
  //     sip: DbSipNumber.sip013,
  //     abi: '"some"',
  //     tx_id: '0x123456',
  //     block_height: 1,
  //   };
  //   const job = await db.chainhook.insertAndEnqueueSmartContract({ values });

  //   // Create mint events.
  //   const event1: BlockchainDbContractLog = {
  //     contract_identifier: contractId,
  //     sender_address: address,
  //     value: cvToHex(
  //       tupleCV({
  //         type: bufferCV(Buffer.from('sft_mint')),
  //         recipient: bufferCV(Buffer.from(address)),
  //         'token-id': uintCV(3),
  //         amount: uintCV(1000),
  //       })
  //     ),
  //   };
  //   const event2: BlockchainDbContractLog = {
  //     contract_identifier: contractId,
  //     sender_address: address,
  //     value: cvToHex(
  //       tupleCV({
  //         type: bufferCV(Buffer.from('sft_mint')),
  //         recipient: bufferCV(Buffer.from(address)),
  //         'token-id': uintCV(7),
  //         amount: uintCV(2000),
  //       })
  //     ),
  //   };

  //   const apiDb = new MockPgBlockchainApiStore();
  //   apiDb.contractLogsByContract = [event1, event2];
  //   const processor = new ProcessSmartContractJob({ db, job, apiDb });
  //   await processor.work();

  //   const tokens = await db.sql<DbToken[]>`SELECT ${db.sql(TOKENS_COLUMNS)} FROM tokens`;
  //   expect(tokens.count).toBe(2);
  //   expect(tokens[0].type).toBe(DbTokenType.sft);
  //   expect(tokens[0].smart_contract_id).toBe(1);
  //   expect(tokens[0].token_number).toBe('3');
  //   expect(tokens[1].type).toBe(DbTokenType.sft);
  //   expect(tokens[1].smart_contract_id).toBe(1);
  //   expect(tokens[1].token_number).toBe('7');
  // });
});

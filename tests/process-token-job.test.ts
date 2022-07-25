import { cvToHex, noneCV, stringUtf8CV, uintCV } from '@stacks/transactions';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { PgStore } from '../src/pg/pg-store';
import { DbJob, DbSipNumber, DbSmartContractInsert, DbTokenType } from '../src/pg/types';
import { ProcessTokenJob } from '../src/token-processor/process-token-job';
import { ENV } from '../src/util/env';
import { cycleMigrations } from './helpers';

describe('ProcessTokenJob', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = new PgStore();
    await cycleMigrations();
  });

  describe('FT', () => {
    let tokenJob: DbJob;

    beforeEach(async () => {
      const values: DbSmartContractInsert = {
        principal: 'ABCD.test-ft',
        sip: DbSipNumber.sip010,
        abi: '"some"',
        tx_id: '0x123456',
        block_height: 1
      };
      await db.insertAndEnqueueSmartContract({ values });
      const cursor = await db.getInsertAndEnqueueTokensCursor({
        smart_contract_id: 1,
        token_count: 1,
        type: DbTokenType.ft
      });
      for await (const [job] of cursor) {
        tokenJob = job
      }
    });

    test('parses FT info', async () => {
      const agent = new MockAgent();
      agent.disableNetConnect();
      const interceptor = agent.get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`);
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-name',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FooToken'))
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-token-uri',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(noneCV()) // We'll do that in another test
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-symbol',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(stringUtf8CV('FOO'))
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-decimals',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(6))
        });
      interceptor
        .intercept({
          path: '/v2/contracts/call-read/ABCD/test-ft/get-total-supply',
          method: 'POST',
        })
        .reply(200, {
          okay: true,
          result: cvToHex(uintCV(600))
        });
      setGlobalDispatcher(agent);

      const processor = new ProcessTokenJob({ db, job: tokenJob });
      await processor.work();

      const token = await db.getToken({ id: 1 });
      expect(token).not.toBeUndefined();
      expect(token?.name).toBe('FooToken');
      expect(token?.symbol).toBe('FOO');
      expect(token?.decimals).toBe(6);
      expect(token?.total_supply).toBe(600);
    });
  });

  // test('enqueues all tokens per NFT contract', async () => {
  //   const agent = new MockAgent();
  //   agent.disableNetConnect();
  //   agent.get(`http://${ENV.STACKS_NODE_RPC_HOST}:${ENV.STACKS_NODE_RPC_PORT}`)
  //     .intercept({
  //       path: '/v2/contracts/call-read/ABCD/test-nft/get-last-token-id',
  //       method: 'POST',
  //     })
  //     .reply(200, {
  //       okay: true,
  //       result: cvToHex(uintCV(5))
  //     });
  //   setGlobalDispatcher(agent);

  //   const values: DbSmartContractInsert = {
  //     principal: 'ABCD.test-nft',
  //     sip: DbSipNumber.sip009,
  //     abi: '"some"',
  //     tx_id: '0x123456',
  //     block_height: 1
  //   };
  //   const job = await db.insertAndEnqueueSmartContract({ values });
  //   const processor = new ProcessSmartContractJob({ db, job });
  //   await processor.work();

  //   const tokens = await db.sql<DbToken[]>`SELECT * FROM tokens`;
  //   expect(tokens.count).toBe(5);
  //   expect(tokens[0].type).toBe(DbTokenType.nft);
  //   expect(tokens[0].smart_contract_id).toBe(1);
  // });

  afterEach(async () => {
    await db.close();
  });
});

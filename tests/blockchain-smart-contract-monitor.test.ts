import * as postgres from 'postgres';
import { ENV } from '../src/env';
import {
  BlockchainDbSmartContract,
  PgBlockchainApiStore,
} from '../src/pg/blockchain-api/pg-blockchain-api-store';
import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber } from '../src/pg/types';
import {
  BlockchainSmartContractMonitor,
  PgSmartContractPayloadType,
} from '../src/token-processor/blockchain-api/blockchain-smart-contract-monitor';
import { cycleMigrations } from './helpers';

const NftAbi = {
  maps: [],
  functions: [
    {
      args: [
        { name: 'user', type: 'principal' },
        {
          name: 'ctx',
          type: {
            tuple: [
              { name: 'index', type: 'uint128' },
              { name: 'member', type: 'principal' },
              { name: 'result', type: 'uint128' },
            ],
          },
        },
      ],
      name: 'find',
      access: 'private',
      outputs: {
        type: {
          tuple: [
            { name: 'index', type: 'uint128' },
            { name: 'member', type: 'principal' },
            { name: 'result', type: 'uint128' },
          ],
        },
      },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'user', type: 'principal' },
      ],
      name: 'is-owner',
      access: 'private',
      outputs: { type: 'bool' },
    },
    {
      args: [{ name: 'amount-in-stx', type: 'uint128' }],
      name: 'claim',
      access: 'public',
      outputs: {
        type: {
          response: {
            ok: 'bool',
            error: {
              tuple: [
                { name: 'code', type: 'uint128' },
                { name: 'kind', type: { 'string-ascii': { length: 17 } } },
              ],
            },
          },
        },
      },
    },
    {
      args: [
        { name: 'token-id', type: 'uint128' },
        { name: 'sender', type: 'principal' },
        { name: 'recipient', type: 'principal' },
      ],
      name: 'transfer',
      access: 'public',
      outputs: {
        type: {
          response: {
            ok: 'bool',
            error: {
              tuple: [
                { name: 'code', type: 'uint128' },
                { name: 'kind', type: { 'string-ascii': { length: 19 } } },
              ],
            },
          },
        },
      },
    },
    {
      args: [],
      name: 'get-last-token-id',
      access: 'read_only',
      outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
    },
    {
      args: [{ name: 'id', type: 'uint128' }],
      name: 'get-meta',
      access: 'read_only',
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                { name: 'mime-type', type: { 'string-ascii': { length: 9 } } },
                { name: 'name', type: { 'string-ascii': { length: 26 } } },
                { name: 'uri', type: { 'string-ascii': { length: 32 } } },
              ],
            },
            error: 'none',
          },
        },
      },
    },
    {
      args: [],
      name: 'get-nft-meta',
      access: 'read_only',
      outputs: {
        type: {
          response: {
            ok: {
              tuple: [
                { name: 'mime-type', type: { 'string-ascii': { length: 9 } } },
                { name: 'name', type: { 'string-ascii': { length: 13 } } },
                { name: 'uri', type: { 'string-ascii': { length: 32 } } },
              ],
            },
            error: 'none',
          },
        },
      },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-owner',
      access: 'read_only',
      outputs: { type: { response: { ok: { optional: 'principal' }, error: 'none' } } },
    },
    {
      args: [{ name: 'token-id', type: 'uint128' }],
      name: 'get-token-uri',
      access: 'read_only',
      outputs: {
        type: {
          response: { ok: { optional: { 'string-ascii': { length: 33 } } }, error: 'none' },
        },
      },
    },
  ],
  variables: [
    { name: 'err-permission-denied', type: 'uint128', access: 'constant' },
    {
      name: 'initial-members',
      type: { list: { type: 'principal', length: 375 } },
      access: 'constant',
    },
  ],
  fungible_tokens: [],
  non_fungible_tokens: [{ name: 'friedger-pool', type: 'uint128' }],
};

class TestPgBlockchainApiStore extends PgBlockchainApiStore {
  private smartContract?: BlockchainDbSmartContract;

  constructor(smartContract?: BlockchainDbSmartContract) {
    super(postgres());
    this.smartContract = smartContract;
  }

  getSmartContract(args: { contractId: string }): Promise<BlockchainDbSmartContract | undefined> {
    return Promise.resolve(this.smartContract);
  }
}

class TestBlockchainMonitor extends BlockchainSmartContractMonitor {
  public async testHandleSmartContract(payload: PgSmartContractPayloadType) {
    return this.handleSmartContract(payload);
  }
}

describe('BlockchainSmartContractMonitor', () => {
  let db: PgStore;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    await cycleMigrations();
  });

  afterEach(async () => {
    await db.close();
  });

  test('enqueues valid token contract', async () => {
    const contract: BlockchainDbSmartContract = {
      contract_id: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
      tx_id: '0x1234',
      block_height: 1,
      abi: NftAbi,
    };
    const apiDb = new TestPgBlockchainApiStore(contract);
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleSmartContract({
      contractId: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
    });

    const dbContract = await db.getSmartContract({ id: 1 });
    expect(dbContract?.sip).toBe(DbSipNumber.sip009);
    expect(dbContract?.principal).toBe(
      'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft'
    );
    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs[0].smart_contract_id).toBe(1);
  });

  test('ignores non-token contract', async () => {
    const contract: BlockchainDbSmartContract = {
      contract_id: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
      tx_id: '0x1234',
      block_height: 1,
      abi: { maps: [], functions: [], variables: [], fungible_tokens: [], non_fungible_tokens: [] },
    };
    const apiDb = new TestPgBlockchainApiStore(contract);
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleSmartContract({
      contractId: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
    });

    const dbContract = await db.getSmartContract({ id: 1 });
    expect(dbContract).toBeUndefined();
    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs[0]).toBeUndefined();
  });
});

import { bufferCV, cvToHex, listCV, stringUtf8CV, tupleCV, uintCV } from '@stacks/transactions';
import { ENV } from '../src/env';
import {
  BlockchainDbBlock,
  BlockchainDbContractLog,
  BlockchainDbSmartContract,
} from '../src/pg/blockchain-api/pg-blockchain-api-store';
import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbSmartContractInsert, DbTokenType } from '../src/pg/types';
import { BlockchainSmartContractMonitor } from '../src/token-processor/blockchain-api/blockchain-smart-contract-monitor';
import { cycleMigrations } from '../src/pg/migrations';
import { MockPgBlockchainApiStore, SIP_009_ABI } from './helpers';

class TestBlockchainMonitor extends BlockchainSmartContractMonitor {
  public async testHandleMessage(message: string) {
    return this.handleMessage(message);
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
      abi: SIP_009_ABI,
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.smartContract = contract;
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractUpdate',
        payload: {
          contractId: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
        },
      })
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
    const contract: BlockchainDbSmartContract = {
      contract_id: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
      tx_id: '0x1234',
      block_height: 1,
      abi: { maps: [], functions: [], variables: [], fungible_tokens: [], non_fungible_tokens: [] },
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.smartContract = contract;
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractUpdate',
        payload: {
          contractId: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
        },
      })
    );

    const dbContract = await db.getSmartContract({ id: 1 });
    expect(dbContract).toBeUndefined();
    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs[0]).toBeUndefined();
  });

  test('enqueues NFT SIP-019 notification for all tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;

    const values: DbSmartContractInsert = {
      principal: contractId,
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.insertAndEnqueueSmartContract({ values });
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 3n, // 3 tokens
      type: DbTokenType.nft,
    });
    // Mark jobs as done to test
    await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
    const jobs1 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs1.length).toBe(0);

    const event: BlockchainDbContractLog = {
      contract_identifier: contractId,
      sender_address: address,
      value: cvToHex(
        tupleCV({
          notification: bufferCV(Buffer.from('token-metadata-update')),
          payload: tupleCV({
            'token-class': bufferCV(Buffer.from('nft')),
            'contract-id': bufferCV(Buffer.from(contractId)),
          }),
        })
      ),
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.contractLog = event;
    const monitor = new TestBlockchainMonitor({ db, apiDb });

    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractLogUpdate',
        payload: {
          txId: '0x1234',
          eventIndex: 1,
        },
      })
    );
    const jobs2 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs2.length).toBe(3);
  });

  test('enqueues NFT SIP-019 notification for specific tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;

    const values: DbSmartContractInsert = {
      principal: contractId,
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.insertAndEnqueueSmartContract({ values });
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 3n, // 3 tokens
      type: DbTokenType.nft,
    });
    // Mark jobs as done to test
    await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
    const jobs1 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs1.length).toBe(0);

    const event: BlockchainDbContractLog = {
      contract_identifier: contractId,
      sender_address: address,
      value: cvToHex(
        tupleCV({
          notification: bufferCV(Buffer.from('token-metadata-update')),
          payload: tupleCV({
            'token-class': bufferCV(Buffer.from('nft')),
            'contract-id': bufferCV(Buffer.from(contractId)),
            'token-ids': listCV([uintCV(1), uintCV(2)]),
          }),
        })
      ),
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.contractLog = event;
    const monitor = new TestBlockchainMonitor({ db, apiDb });

    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractLogUpdate',
        payload: {
          txId: '0x1234',
          eventIndex: 1,
        },
      })
    );
    const jobs2 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs2.length).toBe(2); // Only two tokens
    expect(jobs2[0].token_id).toBe(1);
    expect(jobs2[1].token_id).toBe(2);
  });

  test('ignores other contract log events', async () => {
    const event: BlockchainDbContractLog = {
      contract_identifier: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60.friedger-pool-nft',
      sender_address: 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60',
      value: cvToHex(stringUtf8CV('test')),
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.contractLog = event;
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractLogUpdate',
        payload: {
          txId: '0x1234',
          eventIndex: 1,
        },
      })
    );

    const jobs = await db.getPendingJobBatch({ limit: 1 });
    expect(jobs[0]).toBeUndefined();
  });

  test('ignores SIP-019 notification for frozen tokens', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;

    const values: DbSmartContractInsert = {
      principal: contractId,
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.insertAndEnqueueSmartContract({ values });
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.nft,
    });
    // Mark jobs as done to test
    await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
    const jobs1 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs1.length).toBe(0);

    // Mark token as frozen.
    await db.sql`UPDATE tokens SET update_mode = 'frozen' WHERE TRUE`;
    const token1 = await db.getToken({ id: 1 });
    expect(token1?.update_mode).toBe('frozen');

    const event: BlockchainDbContractLog = {
      contract_identifier: contractId,
      sender_address: address,
      value: cvToHex(
        tupleCV({
          notification: bufferCV(Buffer.from('token-metadata-update')),
          payload: tupleCV({
            'token-class': bufferCV(Buffer.from('nft')),
            'contract-id': bufferCV(Buffer.from(contractId)),
          }),
        })
      ),
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.contractLog = event;
    const monitor = new TestBlockchainMonitor({ db, apiDb });

    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractLogUpdate',
        payload: {
          txId: '0x1234',
          eventIndex: 1,
        },
      })
    );
    const jobs2 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs2.length).toBe(0); // No tokens queued.
  });

  test('updates token refresh mode on SIP-019 notification', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;

    const values: DbSmartContractInsert = {
      principal: contractId,
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.insertAndEnqueueSmartContract({ values });
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.nft,
    });
    // Mark jobs as done to test
    await db.sql`UPDATE jobs SET status = 'done' WHERE TRUE`;
    const jobs1 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs1.length).toBe(0);

    const event: BlockchainDbContractLog = {
      contract_identifier: contractId,
      sender_address: address,
      value: cvToHex(
        tupleCV({
          notification: bufferCV(Buffer.from('token-metadata-update')),
          payload: tupleCV({
            'token-class': bufferCV(Buffer.from('nft')),
            'contract-id': bufferCV(Buffer.from(contractId)),
            'update-mode': stringUtf8CV('frozen'), // Mark as frozen.
          }),
        })
      ),
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.contractLog = event;
    const monitor = new TestBlockchainMonitor({ db, apiDb });

    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractLogUpdate',
        payload: {
          txId: '0x1234',
          eventIndex: 1,
        },
      })
    );
    const token1 = await db.getToken({ id: 1 });
    expect(token1?.update_mode).toBe('frozen');
  });

  test('updates chain tip on observed block', async () => {
    const block: BlockchainDbBlock = {
      block_height: 10,
      block_hash: '0x1234',
      index_block_hash: '0x1111',
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.block = block;
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'blockUpdate',
        payload: {
          blockHash: '0x1234',
        },
      })
    );

    const result = await db.getChainTipBlockHeight();
    expect(result).toBe(10);
  });

  test('enqueues SIP-013 minted token for valid contract', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = 'key-alex-autoalex-v1';
    const values: DbSmartContractInsert = {
      principal: `${address}.${contractId}`,
      sip: DbSipNumber.sip013,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.insertAndEnqueueSmartContract({ values });

    const event: BlockchainDbContractLog = {
      contract_identifier: `${address}.${contractId}`,
      sender_address: address,
      value: cvToHex(
        tupleCV({
          type: bufferCV(Buffer.from('sft-mint')),
          recipient: bufferCV(Buffer.from(address)),
          'token-id': uintCV(3),
          amount: uintCV(1000),
        })
      ),
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.contractLog = event;

    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'smartContractLogUpdate',
        payload: {
          txId: '0x1234',
          eventIndex: 1,
        },
      })
    );

    const token = await db.getToken({ id: 1 });
    expect(token?.type).toBe(DbTokenType.sft);
    expect(token?.token_number).toBe('3');
  });

  test('enqueues dynamic tokens for refresh with standard interval', async () => {
    const address = 'SP1K1A1PMGW2ZJCNF46NWZWHG8TS1D23EGH1KNK60';
    const contractId = `${address}.friedger-pool-nft`;
    ENV.METADATA_DYNAMIC_TOKEN_REFRESH_INTERVAL = 86400;
    const values: DbSmartContractInsert = {
      principal: contractId,
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.insertAndEnqueueSmartContract({ values });
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.nft,
    });
    // Set update_mode and updated_at for testing.
    await db.sql`
      UPDATE tokens
      SET update_mode = 'dynamic', updated_at = NOW() - INTERVAL '2 days'
      WHERE id = 1
    `;
    // Mark jobs as done.
    await db.sql`UPDATE jobs SET status = 'done'`;

    const block: BlockchainDbBlock = {
      block_height: 10,
      block_hash: '0x1234',
      index_block_hash: '0x1111',
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.block = block;
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'blockUpdate',
        payload: {
          blockHash: '0x1234',
        },
      })
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
    await db.insertAndEnqueueSmartContract({ values });
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.nft,
    });
    // Set update_mode and updated_at for testing. Set TTL to 1 hour.
    await db.sql`
      UPDATE tokens
      SET update_mode = 'dynamic', updated_at = NOW() - INTERVAL '2 hours', ttl = 3600
      WHERE id = 1
    `;
    // Mark jobs as done.
    await db.sql`UPDATE jobs SET status = 'done'`;

    const block: BlockchainDbBlock = {
      block_height: 10,
      block_hash: '0x1234',
      index_block_hash: '0x1111',
    };
    const apiDb = new MockPgBlockchainApiStore();
    apiDb.block = block;
    const monitor = new TestBlockchainMonitor({ db, apiDb });
    await monitor.testHandleMessage(
      JSON.stringify({
        type: 'blockUpdate',
        payload: {
          blockHash: '0x1234',
        },
      })
    );

    const job = await db.getJob({ id: 2 });
    expect(job?.status).toBe('pending');
  });
});

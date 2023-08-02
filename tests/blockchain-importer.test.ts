import { ENV } from '../src/env';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import {
  BlockchainDbContractLog,
  BlockchainDbSmartContract,
} from '../src/pg/blockchain-api/pg-blockchain-api-store';
import { DbSipNumber, DbSmartContractInsert, DbTokenType } from '../src/pg/types';
import { MockPgBlockchainApiStore, SIP_009_ABI, SIP_010_ABI, SIP_013_ABI, sleep } from './helpers';
import { BlockchainImporter } from '../src/token-processor/blockchain-api/blockchain-importer';
import { cvToHex, tupleCV, bufferCV, listCV, uintCV } from '@stacks/transactions';
import { cycleMigrations } from '@hirosystems/api-toolkit';

describe('BlockchainImporter', () => {
  let db: PgStore;
  let apiDb: MockPgBlockchainApiStore;
  let importer: BlockchainImporter;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    ENV.BLOCKCHAIN_API_PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    apiDb = new MockPgBlockchainApiStore();
    apiDb.currentBlockHeight = 1;
    importer = new BlockchainImporter({ db, apiDb, startingBlockHeight: 1 });
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await db.close();
  });

  test('discriminates token contracts correctly', async () => {
    // Non-SIP contract
    const contract1: BlockchainDbSmartContract = {
      contract_id: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      tx_id: '0x1234',
      block_height: 1,
      abi: { maps: [], functions: [], variables: [], fungible_tokens: [], non_fungible_tokens: [] },
    };
    // SIP-010
    const contract2: BlockchainDbSmartContract = {
      contract_id: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
      tx_id: '0x1234',
      block_height: 1,
      abi: SIP_010_ABI,
    };
    // SIP-009
    const contract3: BlockchainDbSmartContract = {
      contract_id: 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2',
      tx_id: '0x1234',
      block_height: 1,
      abi: SIP_009_ABI,
    };
    // SIP-013
    const contract4: BlockchainDbSmartContract = {
      contract_id: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1',
      tx_id: '0x1234',
      block_height: 1,
      abi: SIP_013_ABI,
    };
    apiDb.smartContracts = [contract1, contract2, contract3, contract4];

    await importer.import();

    const count1 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM smart_contracts`;
    expect(count1[0].count).toBe(3);

    const nycCoin = await db.getSmartContract({ id: 1 });
    expect(nycCoin?.sip).toBe(DbSipNumber.sip010);
    expect(nycCoin?.principal).toBe(
      'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2'
    );

    const crashPunks = await db.getSmartContract({ id: 2 });
    expect(crashPunks?.sip).toBe(DbSipNumber.sip009);
    expect(crashPunks?.principal).toBe('SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2');

    const autoAlex = await db.getSmartContract({ id: 3 });
    expect(autoAlex?.sip).toBe(DbSipNumber.sip013);
    expect(autoAlex?.principal).toBe(
      'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1'
    );
  });

  test('imports token metadata refresh notifications', async () => {
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
    importer = new BlockchainImporter({ db, apiDb, startingBlockHeight: 2 });
    apiDb.smartContractLogs = [event];
    apiDb.currentBlockHeight = 2;
    await importer.import();

    const jobs2 = await db.getPendingJobBatch({ limit: 10 });
    expect(jobs2.length).toBe(2); // Only two tokens
    expect(jobs2[0].token_id).toBe(1);
    expect(jobs2[1].token_id).toBe(2);
  });

  test('waits for the API to catch up to the chain tip', async () => {
    // Set the API behind on purpose.
    apiDb.currentBlockHeight = 3;
    await db.sql`UPDATE chain_tip SET block_height = 5`;
    importer = new BlockchainImporter({ db, apiDb, startingBlockHeight: 5 });
    importer['apiBlockHeightRetryIntervalMs'] = 1000;

    // Start import, this will trigger a 1s wait loop for the API block height to catch up.
    const importPromise = new Promise<void>(resolve => {
      void importer.import().then(() => resolve());
    });

    // Update the API block height after 500ms.
    await sleep(500);
    apiDb.currentBlockHeight = 5;

    // The import finishes then.
    await importPromise;
  });
});

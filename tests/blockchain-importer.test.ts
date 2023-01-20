import { ENV } from '../src/env';
import { PgStore } from '../src/pg/pg-store';
import { cycleMigrations } from '../src/pg/migrations';
import { BlockchainDbSmartContract } from '../src/pg/blockchain-api/pg-blockchain-api-store';
import { DbSipNumber } from '../src/pg/types';
import { MockPgBlockchainApiStore, SIP_009_ABI, SIP_010_ABI, SIP_013_ABI } from './helpers';
import { BlockchainImporter } from '../src/token-processor/blockchain-api/blockchain-importer';

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
    await cycleMigrations();
  });

  afterEach(async () => {
    await db.close();
    await apiDb.close();
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

  // test('');
});

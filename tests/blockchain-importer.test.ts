import { ENV } from '../src/env';
import { PgStore } from '../src/pg/pg-store';
import { cycleMigrations } from './helpers';
import { BlockchainImporter } from '../src/token-processor/blockchain-api/blockchain-importer';
import {
  BlockchainDbSmartContract,
  PgBlockchainApiStore,
} from '../src/pg/blockchain-api/pg-blockchain-api-store';
import { DbSipNumber } from '../src/pg/types';

class TestBlockchainImporter extends BlockchainImporter {
  public async importContract(contract: BlockchainDbSmartContract) {
    return this.doImportSmartContract(contract);
  }
}

describe('BlockchainImporter', () => {
  let db: PgStore;
  let apiDb: PgBlockchainApiStore;
  let importer: TestBlockchainImporter;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    ENV.BLOCKCHAIN_API_PGDATABASE = 'postgres';
    db = await PgStore.connect();
    apiDb = await PgBlockchainApiStore.connect();
    importer = new TestBlockchainImporter({ db, apiDb });
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
    await importer.importContract(contract1);

    const count1 = await db.sql<{ count: number }[]>`SELECT COUNT(*)::int FROM smart_contracts`;
    expect(count1[0].count).toBe(0);

    // SIP-010
    const contract2: BlockchainDbSmartContract = {
      contract_id: 'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2',
      tx_id: '0x1234',
      block_height: 1,
      abi: {
        maps: [],
        functions: [
          {
            args: [
              { name: 'result', type: { response: { ok: 'bool', error: 'uint128' } } },
              { name: 'prior', type: { response: { ok: 'bool', error: 'uint128' } } },
            ],
            name: 'check-err',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          { args: [], name: 'is-authorized-auth', access: 'private', outputs: { type: 'bool' } },
          {
            args: [
              {
                name: 'recipient',
                type: {
                  tuple: [
                    { name: 'amount', type: 'uint128' },
                    { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
                    { name: 'to', type: 'principal' },
                  ],
                },
              },
            ],
            name: 'send-token',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'amount', type: 'uint128' },
              { name: 'to', type: 'principal' },
              { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
            ],
            name: 'send-token-with-memo',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'amountBonus', type: 'uint128' },
              { name: 'amount1', type: 'uint128' },
              { name: 'amount2', type: 'uint128' },
              { name: 'amount3', type: 'uint128' },
              { name: 'amount4', type: 'uint128' },
              { name: 'amount5', type: 'uint128' },
              { name: 'amountDefault', type: 'uint128' },
            ],
            name: 'set-coinbase-amounts',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'threshold1', type: 'uint128' },
              { name: 'threshold2', type: 'uint128' },
              { name: 'threshold3', type: 'uint128' },
              { name: 'threshold4', type: 'uint128' },
              { name: 'threshold5', type: 'uint128' },
            ],
            name: 'set-coinbase-thresholds',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'coreContract', type: 'principal' },
              { name: 'stacksHeight', type: 'uint128' },
            ],
            name: 'activate-token',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'amount', type: 'uint128' },
              { name: 'owner', type: 'principal' },
            ],
            name: 'burn',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [],
            name: 'convert-to-v2',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'amount', type: 'uint128' },
              { name: 'recipient', type: 'principal' },
            ],
            name: 'mint',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              {
                name: 'recipients',
                type: {
                  list: {
                    type: {
                      tuple: [
                        { name: 'amount', type: 'uint128' },
                        { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
                        { name: 'to', type: 'principal' },
                      ],
                    },
                    length: 200,
                  },
                },
              },
            ],
            name: 'send-many',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'newUri', type: { optional: { 'string-utf8': { length: 256 } } } }],
            name: 'set-token-uri',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'amount', type: 'uint128' },
              { name: 'from', type: 'principal' },
              { name: 'to', type: 'principal' },
              { name: 'memo', type: { optional: { buffer: { length: 34 } } } },
            ],
            name: 'transfer',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'amountBonus', type: 'uint128' },
              { name: 'amount1', type: 'uint128' },
              { name: 'amount2', type: 'uint128' },
              { name: 'amount3', type: 'uint128' },
              { name: 'amount4', type: 'uint128' },
              { name: 'amount5', type: 'uint128' },
              { name: 'amountDefault', type: 'uint128' },
            ],
            name: 'update-coinbase-amounts',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'threshold1', type: 'uint128' },
              { name: 'threshold2', type: 'uint128' },
              { name: 'threshold3', type: 'uint128' },
              { name: 'threshold4', type: 'uint128' },
              { name: 'threshold5', type: 'uint128' },
            ],
            name: 'update-coinbase-thresholds',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'user', type: 'principal' }],
            name: 'get-balance',
            access: 'read_only',
            outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
          },
          {
            args: [],
            name: 'get-coinbase-amounts',
            access: 'read_only',
            outputs: {
              type: {
                response: {
                  ok: {
                    tuple: [
                      { name: 'coinbaseAmount1', type: 'uint128' },
                      { name: 'coinbaseAmount2', type: 'uint128' },
                      { name: 'coinbaseAmount3', type: 'uint128' },
                      { name: 'coinbaseAmount4', type: 'uint128' },
                      { name: 'coinbaseAmount5', type: 'uint128' },
                      { name: 'coinbaseAmountBonus', type: 'uint128' },
                      { name: 'coinbaseAmountDefault', type: 'uint128' },
                    ],
                  },
                  error: 'none',
                },
              },
            },
          },
          {
            args: [],
            name: 'get-coinbase-thresholds',
            access: 'read_only',
            outputs: {
              type: {
                response: {
                  ok: {
                    tuple: [
                      { name: 'coinbaseThreshold1', type: 'uint128' },
                      { name: 'coinbaseThreshold2', type: 'uint128' },
                      { name: 'coinbaseThreshold3', type: 'uint128' },
                      { name: 'coinbaseThreshold4', type: 'uint128' },
                      { name: 'coinbaseThreshold5', type: 'uint128' },
                    ],
                  },
                  error: 'uint128',
                },
              },
            },
          },
          {
            args: [],
            name: 'get-decimals',
            access: 'read_only',
            outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
          },
          {
            args: [],
            name: 'get-name',
            access: 'read_only',
            outputs: {
              type: { response: { ok: { 'string-ascii': { length: 15 } }, error: 'none' } },
            },
          },
          {
            args: [],
            name: 'get-symbol',
            access: 'read_only',
            outputs: {
              type: { response: { ok: { 'string-ascii': { length: 3 } }, error: 'none' } },
            },
          },
          {
            args: [],
            name: 'get-token-uri',
            access: 'read_only',
            outputs: {
              type: {
                response: { ok: { optional: { 'string-utf8': { length: 256 } } }, error: 'none' },
              },
            },
          },
          {
            args: [],
            name: 'get-total-supply',
            access: 'read_only',
            outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
          },
        ],
        variables: [
          { name: 'DECIMALS', type: 'uint128', access: 'constant' },
          {
            name: 'ERR_INVALID_COINBASE_AMOUNT',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR_INVALID_COINBASE_THRESHOLD',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR_TOKEN_ALREADY_ACTIVATED',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR_TOKEN_NOT_ACTIVATED',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR_UNAUTHORIZED',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR_V1_BALANCE_NOT_FOUND',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          { name: 'MICRO_CITYCOINS', type: 'uint128', access: 'constant' },
          { name: 'STATE_ACTIVE', type: 'uint128', access: 'constant' },
          { name: 'STATE_DEPLOYED', type: 'uint128', access: 'constant' },
          { name: 'STATE_INACTIVE', type: 'uint128', access: 'constant' },
          { name: 'TOKEN_BONUS_PERIOD', type: 'uint128', access: 'constant' },
          { name: 'TOKEN_EPOCH_LENGTH', type: 'uint128', access: 'constant' },
          { name: 'coinbaseAmount1', type: 'uint128', access: 'variable' },
          { name: 'coinbaseAmount2', type: 'uint128', access: 'variable' },
          { name: 'coinbaseAmount3', type: 'uint128', access: 'variable' },
          { name: 'coinbaseAmount4', type: 'uint128', access: 'variable' },
          { name: 'coinbaseAmount5', type: 'uint128', access: 'variable' },
          { name: 'coinbaseAmountBonus', type: 'uint128', access: 'variable' },
          { name: 'coinbaseAmountDefault', type: 'uint128', access: 'variable' },
          { name: 'coinbaseThreshold1', type: 'uint128', access: 'variable' },
          { name: 'coinbaseThreshold2', type: 'uint128', access: 'variable' },
          { name: 'coinbaseThreshold3', type: 'uint128', access: 'variable' },
          { name: 'coinbaseThreshold4', type: 'uint128', access: 'variable' },
          { name: 'coinbaseThreshold5', type: 'uint128', access: 'variable' },
          { name: 'tokenActivated', type: 'bool', access: 'variable' },
          {
            name: 'tokenUri',
            type: { optional: { 'string-utf8': { length: 256 } } },
            access: 'variable',
          },
        ],
        fungible_tokens: [{ name: 'newyorkcitycoin' }],
        non_fungible_tokens: [],
      },
    };
    await importer.importContract(contract2);

    const nycCoin = await db.getSmartContract({ id: 1 });
    expect(nycCoin?.sip).toBe(DbSipNumber.sip010);
    expect(nycCoin?.principal).toBe(
      'SPSCWDV3RKV5ZRN1FQD84YE1NQFEDJ9R1F4DYQ11.newyorkcitycoin-token-v2'
    );

    // SIP-009
    const contract3: BlockchainDbSmartContract = {
      contract_id: 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2',
      tx_id: '0x1234',
      block_height: 1,
      abi: {
        maps: [
          {
            key: {
              tuple: [
                { name: 'id', type: 'uint128' },
                { name: 'operator', type: 'principal' },
                { name: 'owner', type: 'principal' },
              ],
            },
            name: 'approvals',
            value: 'bool',
          },
          {
            key: {
              tuple: [
                { name: 'operator', type: 'principal' },
                { name: 'owner', type: 'principal' },
              ],
            },
            name: 'approvals-all',
            value: 'bool',
          },
          {
            key: 'uint128',
            name: 'market',
            value: {
              tuple: [
                { name: 'commission', type: 'principal' },
                { name: 'price', type: 'uint128' },
              ],
            },
          },
          { key: 'principal', name: 'mint-pass', value: 'uint128' },
        ],
        functions: [
          {
            args: [
              { name: 'result', type: { response: { ok: 'bool', error: 'uint128' } } },
              { name: 'prior', type: { response: { ok: 'bool', error: 'uint128' } } },
            ],
            name: 'check-err',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'id', type: 'uint128' },
              { name: 'operator', type: 'principal' },
              { name: 'owner', type: 'principal' },
            ],
            name: 'is-owned-or-approved',
            access: 'private',
            outputs: { type: 'bool' },
          },
          {
            args: [{ name: 'entry', type: 'uint128' }],
            name: 'mint-token-helper',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'mintPrice', type: 'uint128' },
              { name: 'payer', type: 'principal' },
            ],
            name: 'paymint-split',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              {
                name: 'entry',
                type: {
                  tuple: [
                    { name: 'account', type: 'principal' },
                    { name: 'limit', type: 'uint128' },
                  ],
                },
              },
            ],
            name: 'set-mint-pass-helper',
            access: 'private',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'recipient', type: 'principal' },
              { name: 'id', type: 'uint128' },
            ],
            name: 'admin-mint-airdrop',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'entries', type: { list: { type: 'uint128', length: 20 } } }],
            name: 'batch-mint-token',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              {
                name: 'entries',
                type: {
                  list: {
                    type: {
                      tuple: [
                        { name: 'account', type: 'principal' },
                        { name: 'limit', type: 'uint128' },
                      ],
                    },
                    length: 200,
                  },
                },
              },
            ],
            name: 'batch-set-mint-pass',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'entries', type: { list: { type: 'uint128', length: 200 } } }],
            name: 'batch-upgrade-v1-to-v2',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'id', type: 'uint128' }],
            name: 'burn',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'id', type: 'uint128' },
              { name: 'comm', type: 'trait_reference' },
            ],
            name: 'buy-in-ustx',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [],
            name: 'freeze-metadata',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'id', type: 'uint128' },
              { name: 'price', type: 'uint128' },
              { name: 'comm', type: 'trait_reference' },
            ],
            name: 'list-in-ustx',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [],
            name: 'mint-token',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'new-administrator', type: 'principal' }],
            name: 'set-administrator',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'id', type: 'uint128' },
              { name: 'operator', type: 'principal' },
              { name: 'approved', type: 'bool' },
            ],
            name: 'set-approved',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'none' } } },
          },
          {
            args: [
              { name: 'operator', type: 'principal' },
              { name: 'approved', type: 'bool' },
            ],
            name: 'set-approved-all',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'none' } } },
          },
          {
            args: [
              { name: 'account', type: 'principal' },
              { name: 'limit', type: 'uint128' },
            ],
            name: 'set-mint-pass',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'new-token-uri', type: { 'string-ascii': { length: 80 } } }],
            name: 'set-token-uri',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [
              { name: 'id', type: 'uint128' },
              { name: 'owner', type: 'principal' },
              { name: 'recipient', type: 'principal' },
            ],
            name: 'transfer',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'id', type: 'uint128' }],
            name: 'unlist-in-ustx',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [{ name: 'id', type: 'uint128' }],
            name: 'upgrade-v1-to-v2',
            access: 'public',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
          {
            args: [],
            name: 'get-last-token-id',
            access: 'read_only',
            outputs: { type: { response: { ok: 'uint128', error: 'none' } } },
          },
          {
            args: [{ name: 'id', type: 'uint128' }],
            name: 'get-listing-in-ustx',
            access: 'read_only',
            outputs: {
              type: {
                optional: {
                  tuple: [
                    { name: 'commission', type: 'principal' },
                    { name: 'price', type: 'uint128' },
                  ],
                },
              },
            },
          },
          {
            args: [{ name: 'account', type: 'principal' }],
            name: 'get-mint-pass-balance',
            access: 'read_only',
            outputs: { type: 'uint128' },
          },
          {
            args: [{ name: 'id', type: 'uint128' }],
            name: 'get-owner',
            access: 'read_only',
            outputs: { type: { response: { ok: { optional: 'principal' }, error: 'none' } } },
          },
          {
            args: [{ name: 'id', type: 'uint128' }],
            name: 'get-token-uri',
            access: 'read_only',
            outputs: {
              type: {
                response: { ok: { optional: { 'string-ascii': { length: 246 } } }, error: 'none' },
              },
            },
          },
          {
            args: [
              { name: 'id', type: 'uint128' },
              { name: 'operator', type: 'principal' },
            ],
            name: 'is-approved',
            access: 'read_only',
            outputs: { type: { response: { ok: 'bool', error: 'uint128' } } },
          },
        ],
        variables: [
          { name: 'COLLECTION-MAX-SUPPLY', type: 'uint128', access: 'constant' },
          {
            name: 'ERR-ADD-MINT-PASS',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-COLLECTION-LIMIT-REACHED',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-COULDNT-GET-NFT-OWNER',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-COULDNT-GET-V1-DATA',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-METADATA-FROZEN',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-MINT-PASS-LIMIT-REACHED',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-NFT-LISTED',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-NFT-NOT-LISTED-FOR-SALE',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-NOT-ADMINISTRATOR',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-NOT-AUTHORIZED',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-NOT-FOUND',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-NOT-OWNER',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-PAYMENT-ADDRESS',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-PRICE-WAS-ZERO',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          {
            name: 'ERR-WRONG-COMMISSION',
            type: { response: { ok: 'none', error: 'uint128' } },
            access: 'constant',
          },
          { name: 'MINT-PRICE', type: 'uint128', access: 'constant' },
          { name: 'token-name', type: { 'string-ascii': { length: 13 } }, access: 'constant' },
          { name: 'token-symbol', type: { 'string-ascii': { length: 6 } }, access: 'constant' },
          { name: 'wallet-1', type: 'principal', access: 'constant' },
          { name: 'wallet-2', type: 'principal', access: 'constant' },
          { name: 'wallet-3', type: 'principal', access: 'constant' },
          { name: 'wallet-4', type: 'principal', access: 'constant' },
          { name: 'wallet-5', type: 'principal', access: 'constant' },
          { name: 'wallet-6', type: 'principal', access: 'constant' },
          { name: 'wallet-7', type: 'principal', access: 'constant' },
          { name: 'administrator', type: 'principal', access: 'variable' },
          {
            name: 'collection-mint-addresses',
            type: { list: { type: 'principal', length: 4 } },
            access: 'variable',
          },
          {
            name: 'collection-mint-shares',
            type: { list: { type: 'uint128', length: 4 } },
            access: 'variable',
          },
          { name: 'metadata-frozen', type: 'bool', access: 'variable' },
          { name: 'mint-counter', type: 'uint128', access: 'variable' },
          { name: 'token-uri', type: { 'string-ascii': { length: 246 } }, access: 'variable' },
        ],
        fungible_tokens: [],
        non_fungible_tokens: [{ name: 'crashpunks-v2', type: 'uint128' }],
      },
    };
    await importer.importContract(contract3);

    const crashPunks = await db.getSmartContract({ id: 2 });
    expect(crashPunks?.sip).toBe(DbSipNumber.sip009);
    expect(crashPunks?.principal).toBe('SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2');
  });
});

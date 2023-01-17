import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbSmartContractInsert, DbTokenType } from '../src/pg/types';
import { startTestApiServer, TestFastifyServer } from './helpers';

describe('SFT routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await startTestApiServer(db);
    await cycleMigrations();
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  const enqueueToken = async () => {
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
    await db.insertAndEnqueueTokenArray([
      {
        smart_contract_id: 1,
        type: DbTokenType.sft,
        token_number: 1,
      },
    ]);
  };

  test('token not found', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: 'Token not found' });
  });

  test('token not processed', async () => {
    await enqueueToken();
    const response = await fastify.inject({
      method: 'GET',
      url: '/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toStrictEqual({ error: 'Token metadata fetch in progress' });
  });

  test('locale not found', async () => {
    await enqueueToken();
    await db.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: null,
          symbol: null,
          decimals: 6,
          total_supply: 200,
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: 1,
              name: 'key-alex-autoalex-v1',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'test',
              image: null,
              cached_image: null,
            },
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1?locale=es',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toStrictEqual({ error: 'Locale not found' });
  });

  test('empty metadata locales', async () => {
    await enqueueToken();
    await db.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'key-alex-autoalex-v1',
          symbol: null,
          decimals: 6,
          total_supply: 1,
          uri: 'http://test.com/uri.json',
        },
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      decimals: 6,
      total_supply: '1',
      token_uri: 'http://test.com/uri.json',
    });
  });

  test('valid SFT metadata', async () => {
    await enqueueToken();
    await db.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: null,
          symbol: null,
          decimals: 6,
          total_supply: 200,
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: 1,
              name: 'key-alex-autoalex-v1',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'test',
              image: null,
              cached_image: null,
            },
            attributes: [
              {
                trait_type: 'strength',
                display_type: 'number',
                value: JSON.stringify(105),
              },
              {
                trait_type: 'powers',
                display_type: 'array',
                value: JSON.stringify([1, 2, 4]),
              },
            ],
            properties: [
              {
                name: 'prop1',
                value: JSON.stringify('ABC'),
              },
              {
                name: 'prop2',
                value: JSON.stringify(1),
              },
            ],
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      token_uri: 'http://test.com/uri.json',
      decimals: 6,
      total_supply: '200',
      metadata: {
        sip: 16,
        description: 'test',
        name: 'key-alex-autoalex-v1',
        attributes: [
          {
            display_type: 'number',
            trait_type: 'strength',
            value: 105,
          },
          {
            display_type: 'array',
            trait_type: 'powers',
            value: [1, 2, 4],
          },
        ],
        properties: {
          prop1: 'ABC',
          prop2: 1,
        },
      },
    });
  });
});

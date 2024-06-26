import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../src/env';
import { MIGRATIONS_DIR, PgStore } from '../src/pg/pg-store';
import { DbSipNumber, DbSmartContractInsert, DbTokenType } from '../src/pg/types';
import { startTestApiServer, TestFastifyServer } from './helpers';

describe('NFT routes', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    ENV.PGDATABASE = 'postgres';
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await startTestApiServer(db);
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  const enqueueContract = async () => {
    const values: DbSmartContractInsert = {
      principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.insertAndEnqueueSmartContract({ values });
  };

  const enqueueToken = async () => {
    await enqueueContract();
    await db.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.nft,
    });
  };

  test('contract not found', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/Contract not found/);
  });

  test('token not found', async () => {
    await enqueueContract();
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/Token not found/);
  });

  test('token not processed', async () => {
    await enqueueToken();
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toStrictEqual({ error: 'Token metadata fetch in progress' });
  });

  test('invalid contract', async () => {
    await enqueueToken();
    await db.sql`UPDATE jobs SET status = 'invalid' WHERE id = 1`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatch(/Token contract/);
  });

  test('invalid token metadata', async () => {
    await enqueueToken();
    await db.sql`UPDATE jobs SET status = 'invalid' WHERE id = 2`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatch(/Token metadata/);
  });

  test('locale not found', async () => {
    await enqueueToken();
    await db.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'hello-world',
          symbol: null,
          decimals: null,
          total_supply: '1',
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: 1,
              name: 'hello-world',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'test',
              image: null,
              cached_image: null,
              cached_thumbnail_image: null,
            },
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1?locale=es',
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
          name: 'hello-world',
          symbol: null,
          decimals: null,
          total_supply: '1',
          uri: 'http://test.com/uri.json',
        },
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ token_uri: 'http://test.com/uri.json' });
  });

  test('valid NFT metadata', async () => {
    await enqueueToken();
    await db.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'hello-world',
          symbol: null,
          decimals: null,
          total_supply: '1',
          uri: 'http://test.com/uri.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: 1,
              name: 'hello-world',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'test',
              image: 'http://test.com/image.png',
              cached_image: 'http://test.com/image.png?processed=true',
              cached_thumbnail_image: 'http://test.com/image.png?thumb=true',
            },
            attributes: [
              {
                trait_type: 'strength',
                display_type: 'number',
                value: 105,
              },
              {
                trait_type: 'powers',
                display_type: 'array',
                value: [1, 2, 4],
              },
            ],
            properties: [
              {
                name: 'prop1',
                value: 'ABC',
              },
              {
                name: 'prop2',
                value: 1,
              },
            ],
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      token_uri: 'http://test.com/uri.json',
      metadata: {
        sip: 16,
        description: 'test',
        name: 'hello-world',
        image: 'http://test.com/image.png',
        cached_image: 'http://test.com/image.png?processed=true',
        cached_thumbnail_image: 'http://test.com/image.png?thumb=true',
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
    const noVersionResponse = await fastify.inject({
      method: 'GET',
      url: '/metadata/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toEqual(noVersionResponse.statusCode);
    expect(response.json()).toStrictEqual(noVersionResponse.json());
  });
});

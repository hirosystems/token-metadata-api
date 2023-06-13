import { ENV } from '../src/env';
import { cycleMigrations } from '../src/pg/migrations';
import { PgStore } from '../src/pg/pg-store';
import {
  DbFungibleTokenMetadataItem,
  DbSipNumber,
  DbSmartContractInsert,
  DbTokenType,
} from '../src/pg/types';
import { startTestApiServer, TestFastifyServer } from './helpers';

describe('FT routes', () => {
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

  const enqueueContract = async () => {
    const values: DbSmartContractInsert = {
      principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      sip: DbSipNumber.sip010,
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
      type: DbTokenType.ft,
    });
  };

  test('contract not found', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/Contract not found/);
  });

  test('token not found', async () => {
    await enqueueContract();
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/Token not found/);
  });

  test('token not processed', async () => {
    await enqueueToken();
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toStrictEqual({ error: 'Token metadata fetch in progress' });
  });

  test('invalid contract', async () => {
    await enqueueToken();
    await db.sql`UPDATE jobs SET status = 'invalid' WHERE id = 1`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatch(/Token contract/);
  });

  test('invalid token metadata', async () => {
    await enqueueToken();
    await db.sql`UPDATE jobs SET status = 'invalid' WHERE id = 2`;
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
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
          symbol: 'HELLO',
          decimals: 6,
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
            },
          },
        ],
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world?locale=es',
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
          symbol: 'HELLO',
          decimals: 6,
          total_supply: '1',
          uri: 'http://test.com/uri.json',
        },
      },
    });
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      decimals: 6,
      name: 'hello-world',
      symbol: 'HELLO',
      token_uri: 'http://test.com/uri.json',
      total_supply: '1',
      sender_address: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS',
      tx_id: '0x123456',
    });
  });

  test('valid FT metadata', async () => {
    await enqueueToken();
    await db.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: 'hello-world',
          symbol: 'HELLO',
          decimals: 6,
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
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      name: 'hello-world',
      symbol: 'HELLO',
      token_uri: 'http://test.com/uri.json',
      total_supply: '1',
      decimals: 6,
      sender_address: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS',
      tx_id: '0x123456',
      description: 'test',
      image_canonical_uri: 'http://test.com/image.png',
      image_uri: 'http://test.com/image.png?processed=true',
      metadata: {
        sip: 16,
        description: 'test',
        name: 'hello-world',
        image: 'http://test.com/image.png',
        cached_image: 'http://test.com/image.png?processed=true',
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
      url: '/metadata/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toEqual(noVersionResponse.statusCode);
    expect(response.json()).toStrictEqual(noVersionResponse.json());
  });

  describe('index', () => {
    const insertFt = async (item: DbFungibleTokenMetadataItem) => {
      const values: DbSmartContractInsert = {
        principal: item.principal,
        sip: DbSipNumber.sip010,
        abi: '"some"',
        tx_id: item.tx_id,
        block_height: 1,
      };
      const job = await db.insertAndEnqueueSmartContract({ values });
      const [tokenJob] = await db.insertAndEnqueueSequentialTokens({
        smart_contract_id: job.smart_contract_id ?? 0,
        token_count: 1n,
        type: DbTokenType.ft,
      });
      await db.updateProcessedTokenWithMetadata({
        id: tokenJob.token_id ?? 0,
        values: {
          token: {
            name: item.name,
            symbol: item.symbol,
            decimals: item.decimals,
            total_supply: item.total_supply?.toString(),
            uri: item.uri ?? null,
          },
          metadataLocales: [
            {
              metadata: {
                sip: 16,
                token_id: tokenJob.token_id ?? 0,
                name: item.name ?? '',
                l10n_locale: 'en',
                l10n_uri: null,
                l10n_default: true,
                description: item.description ?? '',
                image: item.image ?? '',
                cached_image: item.cached_image ?? '',
              },
            },
          ],
        },
      });
    };

    const insertFtList = async () => {
      await insertFt({
        name: 'Meme token',
        symbol: 'MEME',
        decimals: 5,
        description: 'Meme',
        tx_id: '0xbdc41843d5e0cd4a70611f6badeb5c87b07b12309e77c4fbaf2334c7b4cee89b',
        principal: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1.meme-token',
        total_supply: 200000n,
        image: 'http://img.com/meme.jpg',
        cached_image: 'http://img.com/meme.jpg',
        uri: 'https://ipfs.io/abcd.json',
      });
      await insertFt({
        name: 'miamicoin',
        symbol: 'MIA',
        decimals: 6,
        total_supply: 5586789829000000n,
        uri: 'https://cdn.citycoins.co/metadata/miamicoin.json',
        description: 'A CityCoin for Miami, ticker is MIA, Stack it to earn Stacks (STX)',
        image: 'https://cdn.citycoins.co/logos/miamicoin.png',
        cached_image: 'https://cdn.citycoins.co/logos/miamicoin.png',
        tx_id: '0xa80a44790929467693ccb33a212cf50878a6ad572c4c5b8e7d9a5de794fbefa2',
        principal: 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2',
      });
      await insertFt({
        name: 'STACKSWAP',
        symbol: 'STSW',
        decimals: 6,
        total_supply: 1000000000000000n,
        uri: 'https://app.stackswap.org/token/stsw.json',
        description: 'StackSwap Project',
        image: 'https://app.stackswap.org/icon/stsw.svg',
        cached_image: 'https://app.stackswap.org/icon/stsw.svg',
        tx_id: '0x3edffbd025ca2c29cfde8c583c0e0babacd4aa21075d10307d37c64ae78d579e',
        principal: 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.stsw-token-v4a',
      });
    };

    test('shows a list of tokens', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft',
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(3);
      expect(json.results[0]).toStrictEqual({
        decimals: 5,
        description: 'Meme',
        image_canonical_uri: 'http://img.com/meme.jpg',
        image_uri: 'http://img.com/meme.jpg',
        name: 'Meme token',
        sender_address: 'SP22PCWZ9EJMHV4PHVS0C8H3B3E4Q079ZHY6CXDS1',
        symbol: 'MEME',
        token_uri: 'https://ipfs.io/abcd.json',
        total_supply: '200000',
        tx_id: '0xbdc41843d5e0cd4a70611f6badeb5c87b07b12309e77c4fbaf2334c7b4cee89b',
      });
      expect(json.results[1]).toStrictEqual({
        decimals: 6,
        description: 'A CityCoin for Miami, ticker is MIA, Stack it to earn Stacks (STX)',
        image_canonical_uri: 'https://cdn.citycoins.co/logos/miamicoin.png',
        image_uri: 'https://cdn.citycoins.co/logos/miamicoin.png',
        name: 'miamicoin',
        sender_address: 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R',
        symbol: 'MIA',
        token_uri: 'https://cdn.citycoins.co/metadata/miamicoin.json',
        total_supply: '5586789829000000',
        tx_id: '0xa80a44790929467693ccb33a212cf50878a6ad572c4c5b8e7d9a5de794fbefa2',
      });
      expect(json.results[2]).toStrictEqual({
        decimals: 6,
        description: 'StackSwap Project',
        image_canonical_uri: 'https://app.stackswap.org/icon/stsw.svg',
        image_uri: 'https://app.stackswap.org/icon/stsw.svg',
        name: 'STACKSWAP',
        sender_address: 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275',
        symbol: 'STSW',
        token_uri: 'https://app.stackswap.org/token/stsw.json',
        total_supply: '1000000000000000',
        tx_id: '0x3edffbd025ca2c29cfde8c583c0e0babacd4aa21075d10307d37c64ae78d579e',
      });
    });

    test('filters by name', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?name=miami', // Partial match
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.results[0].symbol).toBe('MIA');
    });

    test('filters by symbol', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?symbol=MIA',
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.results[0].symbol).toBe('MIA');
    });

    test('filters by address', async () => {
      await insertFtList();
      const response = await fastify.inject({
        method: 'GET',
        url: '/metadata/ft?address=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R',
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.total).toBe(1);
      expect(json.results[0].symbol).toBe('MIA');
    });
  });
});

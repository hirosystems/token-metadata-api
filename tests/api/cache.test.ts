import { cycleMigrations } from '@hirosystems/api-toolkit';
import { ENV } from '../../src/env';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store';
import { DbSmartContractInsert, DbSipNumber, DbTokenType } from '../../src/pg/types';
import { TestFastifyServer, startTestApiServer } from '../helpers';

describe('ETag cache', () => {
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

  test('FT cache control', async () => {
    const values: DbSmartContractInsert = {
      principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      sip: DbSipNumber.sip010,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.chainhook.insertAndEnqueueSmartContract({ values });
    await db.chainhook.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.ft,
    });
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
          },
        ],
      },
    });

    // Request returns etag
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag = response.headers.etag;

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);

    // Simulate modified token and check status code
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      headers: { 'if-none-match': etag },
    });
    expect(cached2.statusCode).toBe(200);
  });

  test('NFT cache control', async () => {
    const values: DbSmartContractInsert = {
      principal: 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      sip: DbSipNumber.sip009,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.chainhook.insertAndEnqueueSmartContract({ values });
    await db.chainhook.insertAndEnqueueSequentialTokens({
      smart_contract_id: 1,
      token_count: 1n,
      type: DbTokenType.nft,
    });
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
            },
          },
        ],
      },
    });

    // Request returns etag
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag = response.headers.etag;

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);

    // Simulate modified token and check status code
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
      headers: { 'if-none-match': etag },
    });
    expect(cached2.statusCode).toBe(200);
  });

  test('SFT cache control', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = 'key-alex-autoalex-v1';
    const values: DbSmartContractInsert = {
      principal: `${address}.${contractId}`,
      sip: DbSipNumber.sip013,
      abi: '"some"',
      tx_id: '0x123456',
      block_height: 1,
    };
    await db.chainhook.insertAndEnqueueSmartContract({ values });
    await db.chainhook.insertAndEnqueueTokens([
      {
        smart_contract_id: 1,
        type: DbTokenType.sft,
        token_number: '1',
      },
    ]);
    await db.updateProcessedTokenWithMetadata({
      id: 1,
      values: {
        token: {
          name: null,
          symbol: null,
          decimals: 6,
          total_supply: '200',
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
              image: 'http://test.com/image.png',
              cached_image: 'http://test.com/image.png?processed=true',
            },
          },
        ],
      },
    });

    // Request returns etag
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).not.toBeUndefined();
    const etag = response.headers.etag;

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
      headers: { 'if-none-match': etag },
    });
    expect(cached.statusCode).toBe(304);

    // Simulate modified token and check status code
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
      headers: { 'if-none-match': etag },
    });
    expect(cached2.statusCode).toBe(200);
  });
});

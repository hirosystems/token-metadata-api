import { strict as assert } from 'node:assert';
import { cycleMigrations } from '@stacks/api-toolkit';
import { MIGRATIONS_DIR, PgStore } from '../../src/pg/pg-store.js';
import { DbSipNumber } from '../../src/pg/types.js';
import {
  TestFastifyServer,
  insertAndEnqueueTestContractWithTokens,
  insertTestUpdateNotification,
  setupEnv,
  startTestApiServer,
} from '../helpers.js';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { DbTokenUpdateMode } from '../../src/pg/types.js';
import { ENV } from '../../src/env.js';

describe('ETag cache', () => {
  let db: PgStore;
  let fastify: TestFastifyServer;

  beforeEach(async () => {
    setupEnv();
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await startTestApiServer(db);
    await cycleMigrations(MIGRATIONS_DIR);
  });

  afterEach(async () => {
    await fastify.close();
    await db.close();
  });

  test('chain tip cache control', async () => {
    await db.core.insertBlock(db.sql, {
      block_height: 99,
      index_block_hash: '0x99',
      parent_index_block_hash: '0x000000',
      transactions: [],
    });
    const response = await fastify.inject({ method: 'GET', url: '/metadata/v1/' });
    const json = response.json();
    assert.deepStrictEqual(json, {
      server_version: 'token-metadata-api v0.0.1 (test:123456)',
      status: 'ready',
      chain_tip: {
        block_height: 99,
        index_block_hash: '0x99',
      },
    });
    assert.notStrictEqual(response.headers.etag, undefined);
    const etag = response.headers.etag;

    const cached = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached.statusCode, 304);

    await db.core.insertBlock(db.sql, {
      block_height: 100,
      index_block_hash: '0x100',
      parent_index_block_hash: '0x99',
      transactions: [],
    });
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached2.statusCode, 200);
  });

  test('FT cache control', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
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
              cached_thumbnail_image: 'http://test.com/image.png?thumb=true',
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
    assert.strictEqual(response.statusCode, 200);
    assert.notStrictEqual(response.headers.etag, undefined);
    const etag = response.headers.etag;

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached.statusCode, 304);

    // Simulate modified token and check status code
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/ft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached2.statusCode, 200);
  });

  test('NFT cache control', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip009,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
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

    // Request returns etag
    const response = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
    });
    assert.strictEqual(response.statusCode, 200);
    assert.notStrictEqual(response.headers.etag, undefined);
    const etag = response.headers.etag;

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached.statusCode, 304);

    // Simulate modified token and check status code
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/nft/SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world/1',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached2.statusCode, 200);
  });

  test('Search cache control', async () => {
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world',
      DbSipNumber.sip010,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
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
              cached_thumbnail_image: null,
            },
          },
        ],
      },
    });
    await insertAndEnqueueTestContractWithTokens(
      db,
      'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2',
      DbSipNumber.sip010,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
      id: 2,
      values: {
        token: {
          name: 'miamicoin',
          symbol: 'MIA',
          decimals: 6,
          total_supply: '1000000',
          uri: 'http://test.com/mia.json',
        },
        metadataLocales: [
          {
            metadata: {
              sip: 16,
              token_id: 2,
              name: 'miamicoin',
              l10n_locale: 'en',
              l10n_uri: null,
              l10n_default: true,
              description: 'miami',
              image: null,
              cached_image: null,
              cached_thumbnail_image: null,
            },
          },
        ],
      },
    });

    const searchUrl =
      '/metadata/v1/search?contract=SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world&contract=SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2';

    // Request returns etag
    const response = await fastify.inject({ method: 'GET', url: searchUrl });
    assert.strictEqual(response.statusCode, 200);
    assert.notStrictEqual(response.headers.etag, undefined);
    const etag = response.headers.etag;

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: searchUrl,
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached.statusCode, 304);

    // Updating one token in the batch invalidates the etag
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 2`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: searchUrl,
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached2.statusCode, 200);
  });

  test('SFT cache control', async () => {
    const address = 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9';
    const contractId = 'key-alex-autoalex-v1';
    await insertAndEnqueueTestContractWithTokens(
      db,
      `${address}.${contractId}`,
      DbSipNumber.sip013,
      1n
    );
    await db.core.updateProcessedTokenWithMetadata({
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
              cached_thumbnail_image: 'http://test.com/image.png?thumb=true',
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
    assert.strictEqual(response.statusCode, 200);
    assert.notStrictEqual(response.headers.etag, undefined);
    const etag = response.headers.etag;

    // Cached response
    const cached = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached.statusCode, 304);

    // Simulate modified token and check status code
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;
    const cached2 = await fastify.inject({
      method: 'GET',
      url: '/metadata/v1/sft/SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1/1',
      headers: { 'if-none-match': etag },
    });
    assert.strictEqual(cached2.statusCode, 200);
  });
});

describe('Dynamic token cache control', () => {
  const contract = 'SP2SYHR84SDJJDK8M09HFS4KBFXPPCX9H7RZ9YVTS.hello-world';
  const url = `/metadata/v1/nft/${contract}/1`;
  let db: PgStore;
  let fastify: TestFastifyServer;
  let maxCacheAge: number;

  async function insertProcessedNft() {
    await insertAndEnqueueTestContractWithTokens(db, contract, DbSipNumber.sip009, 1n);
    await db.core.updateProcessedTokenWithMetadata({
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
  }

  /** Reads the `max-age` directive from a `Cache-Control` header. */
  function maxAge(response: { headers: Record<string, unknown> }): number | undefined {
    const header = response.headers['cache-control'] as string | undefined;
    const match = header?.match(/max-age=(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }

  beforeEach(async () => {
    setupEnv();
    maxCacheAge = ENV.METADATA_DYNAMIC_TOKEN_MAX_CACHE_AGE;
    db = await PgStore.connect({ skipMigrations: true });
    fastify = await startTestApiServer(db);
    await cycleMigrations(MIGRATIONS_DIR);
    await insertProcessedNft();
  });

  afterEach(async () => {
    ENV.METADATA_DYNAMIC_TOKEN_MAX_CACHE_AGE = maxCacheAge;
    await fastify.close();
    await db.close();
  });

  test('dynamic token with ttl advertises its freshness lifetime', async () => {
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.dynamic,
      ttl: 3600,
    });
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;

    const response = await fastify.inject({ method: 'GET', url });
    assert.strictEqual(response.statusCode, 200);
    // Allow for a small delta between the DB write and the request.
    const age = maxAge(response);
    assert.ok(age !== undefined && age > 3590 && age <= 3600, `unexpected max-age: ${age}`);
    assert.match(response.headers['cache-control'] as string, /^public, max-age=/);
    assert.notStrictEqual(response.headers.etag, undefined);
    const expires = Date.parse(response.headers.expires as string);
    assert.ok(!isNaN(expires), 'Expires header is not a valid HTTP date');
    assert.ok(expires > Date.now(), 'Expires header is in the past');
  });

  test('304 responses keep the freshness lifetime', async () => {
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.dynamic,
      ttl: 3600,
    });
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;

    const response = await fastify.inject({ method: 'GET', url });
    const cached = await fastify.inject({
      method: 'GET',
      url,
      headers: { 'if-none-match': response.headers.etag as string },
    });
    assert.strictEqual(cached.statusCode, 304);
    const age = maxAge(cached);
    assert.ok(age !== undefined && age > 3590 && age <= 3600, `unexpected max-age: ${age}`);
    assert.notStrictEqual(cached.headers.expires, undefined);
  });

  test('freshness lifetime is capped', async () => {
    ENV.METADATA_DYNAMIC_TOKEN_MAX_CACHE_AGE = 300;
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.dynamic,
      // A ttl large enough to overflow postgres' interval type if it weren't capped.
      ttl: 99999999999999,
    });
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;

    const response = await fastify.inject({ method: 'GET', url });
    assert.strictEqual(response.statusCode, 200);
    const age = maxAge(response);
    assert.ok(age !== undefined && age > 290 && age <= 300, `unexpected max-age: ${age}`);
  });

  test('dynamic token without a ttl must revalidate', async () => {
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.dynamic,
    });

    const response = await fastify.inject({ method: 'GET', url });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['cache-control'], 'public, no-cache, must-revalidate');
    assert.strictEqual(response.headers.expires, undefined);
  });

  test('standard token must revalidate', async () => {
    const response = await fastify.inject({ method: 'GET', url });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['cache-control'], 'public, no-cache, must-revalidate');
    assert.strictEqual(response.headers.expires, undefined);
  });

  test('dynamic token that is already due for refresh must revalidate', async () => {
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.dynamic,
      ttl: 3600,
    });
    await db.sql`UPDATE tokens SET updated_at = NOW() - INTERVAL '2 hours' WHERE id = 1`;

    const response = await fastify.inject({ method: 'GET', url });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['cache-control'], 'public, no-cache, must-revalidate');
    assert.strictEqual(response.headers.expires, undefined);
  });

  test('a later update mode supersedes a dynamic ttl', async () => {
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.dynamic,
      ttl: 3600,
      event_index: 0,
    });
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.frozen,
      event_index: 1,
    });
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;

    const response = await fastify.inject({ method: 'GET', url });
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['cache-control'], 'public, no-cache, must-revalidate');
    assert.strictEqual(response.headers.expires, undefined);
  });

  test('errors are not cacheable', async () => {
    await insertTestUpdateNotification(db, {
      token_id: 1,
      update_mode: DbTokenUpdateMode.dynamic,
      ttl: 3600,
    });
    await db.sql`UPDATE tokens SET updated_at = NOW() WHERE id = 1`;

    const response = await fastify.inject({ method: 'GET', url: `/metadata/v1/nft/${contract}/2` });
    assert.strictEqual(response.statusCode, 404);
    assert.strictEqual(response.headers['cache-control'], undefined);
    assert.strictEqual(response.headers.expires, undefined);
    assert.strictEqual(response.headers.etag, undefined);
  });
});

// `METADATA_FETCH_HTTP_AGENT` is built once, when `metadata-helpers.ts` is first imported, so its
// timeouts and payload limit are fixed from `ENV` at that moment. Setting the variables here and
// importing everything dynamically is what lets this file pick limits small enough to assert
// against in milliseconds. Every test file gets its own process, so this affects nothing else.
process.env.METADATA_FETCH_TIMEOUT_MS = '300';
process.env.METADATA_MAX_PAYLOAD_BYTE_SIZE = '2000';

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';

describe('Metadata fetch agent configuration', () => {
  let startTestHttpServer: typeof import('../helpers.js').startTestHttpServer;
  let fetchMetadata: typeof import('../../src/token-processor/util/metadata-helpers.js').fetchMetadata;
  let errors: typeof import('../../src/token-processor/util/errors.js');
  let server: Awaited<ReturnType<typeof startTestHttpServer>>;

  before(async () => {
    ({ startTestHttpServer } = await import('../helpers.js'));
    ({ fetchMetadata } = await import('../../src/token-processor/util/metadata-helpers.js'));
    errors = await import('../../src/token-processor/util/errors.js');
    server = await startTestHttpServer();
  });

  after(async () => {
    await server.close();
  });

  test('applies METADATA_MAX_PAYLOAD_BYTE_SIZE to the response body', async () => {
    server.serve('/big.json', { body: 'x'.repeat(5000) });
    await assert.rejects(
      fetchMetadata(new URL(server.urlFor('/big.json')), 'ABCD.test', 1n),
      errors.MetadataSizeExceededError
    );
  });

  test('accepts a payload under the limit', async () => {
    server.serve('/small.json', { body: 'x'.repeat(500) });
    const result = await fetchMetadata(new URL(server.urlFor('/small.json')), 'ABCD.test', 1n);
    assert.equal(result?.length, 500);
  });

  test('applies METADATA_FETCH_TIMEOUT_MS to slow response headers', async () => {
    server.serve('/slow-headers.json', { delayMs: 3000, body: 'too late' });
    await assert.rejects(
      fetchMetadata(new URL(server.urlFor('/slow-headers.json')), 'ABCD.test', 1n),
      errors.MetadataTimeoutError
    );
  });

  test('applies METADATA_FETCH_TIMEOUT_MS to slow response bodies', async () => {
    // Headers arrive immediately here, so this can only be the agent's `bodyTimeout`: the header
    // timeout has already been satisfied by the time the body stalls.
    server.serve('/slow-body.json', { bodyDelayMs: 3000, body: 'too late' });
    await assert.rejects(
      fetchMetadata(new URL(server.urlFor('/slow-body.json')), 'ABCD.test', 1n),
      errors.MetadataTimeoutError
    );
  });
});

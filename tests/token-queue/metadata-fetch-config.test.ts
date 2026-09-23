// `METADATA_FETCH_HTTP_AGENT` is built once, when `metadata-helpers.ts` is first imported, so its
// timeouts, payload limit and redirect budget are fixed from `ENV` at that moment. Setting the variables here and
// importing everything dynamically is what lets this file pick limits small enough to assert
// against in milliseconds. Every test file gets its own process, so this affects nothing else.
process.env.METADATA_FETCH_TIMEOUT_MS = '300';
process.env.METADATA_MAX_PAYLOAD_BYTE_SIZE = '2000';
process.env.METADATA_FETCH_MAX_REDIRECTIONS = '2';

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';

describe('Metadata fetch agent configuration', () => {
  let startTestHttpServer: typeof import('../helpers.js').startTestHttpServer;
  let startHeaderRecordingServer: typeof import('../helpers.js').startHeaderRecordingServer;
  let fetchMetadata: typeof import('../../src/token-processor/util/metadata-helpers.js').fetchMetadata;
  let errors: typeof import('../../src/token-processor/util/errors.js');
  let server: Awaited<ReturnType<typeof startTestHttpServer>>;

  before(async () => {
    ({ startTestHttpServer, startHeaderRecordingServer } = await import('../helpers.js'));
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

  test('follows redirects up to METADATA_FETCH_MAX_REDIRECTIONS', async () => {
    const redirect = (to: string) => ({ status: 302, headers: { location: server.urlFor(to) } });
    server.serve('/hop-1.json', redirect('/hop-2.json'));
    server.serve('/hop-2.json', redirect('/landed.json'));
    server.serve('/landed.json', { body: '{"name":"landed"}' });

    const result = await fetchMetadata(new URL(server.urlFor('/hop-1.json')), 'ABCD.test', 1n);

    assert.equal(result, '{"name":"landed"}');
    assert.equal(server.requestCount('/landed.json'), 1, 'the final hop is the one that is read');
  });

  test('reports an unresolved redirect rather than an unparseable body', async () => {
    // One hop past the limit. undici hands the last 3xx back to the caller instead of throwing, so
    // without an explicit guard its body reaches the JSON parser and surfaces as a
    // `MetadataParseError` that says nothing about redirects.
    const redirect = (to: string) => ({ status: 302, headers: { location: server.urlFor(to) } });
    server.serve('/over-1.json', redirect('/over-2.json'));
    server.serve('/over-2.json', redirect('/over-3.json'));
    server.serve('/over-3.json', redirect('/unreached.json'));
    server.serve('/unreached.json', { body: '{"name":"unreached"}' });

    await assert.rejects(
      fetchMetadata(new URL(server.urlFor('/over-1.json')), 'ABCD.test', 1n),
      (error: unknown) => {
        assert.ok(error instanceof errors.MetadataHttpError);
        assert.match(error.message, /unfollowed 302 response \(redirect limit 2\)/);
        return true;
      }
    );
    assert.equal(server.requestCount('/unreached.json'), 0, 'the budget stops the last hop');
  });

  test('keeps gateway headers on a same-origin redirect', async () => {
    const gateway = await startHeaderRecordingServer(res => {
      if (res.req.url === '/moved') {
        res.statusCode = 200;
        res.end('{"name":"same-origin"}');
        return;
      }
      res.statusCode = 302;
      res.setHeader('location', '/moved');
      res.end();
    });
    try {
      const result = await fetchMetadata(new URL(gateway.url), 'ABCD.test', 1n, {
        'X-Api-Key': 'gateway-secret',
      });
      assert.equal(result, '{"name":"same-origin"}');
      assert.equal(gateway.seen.length, 2);
      assert.equal(gateway.seen[1]['x-api-key'], 'gateway-secret');
    } finally {
      await gateway.close();
    }
  });

  test('strips gateway headers when a redirect leaves the origin', async () => {
    // undici only sheds `authorization`, `cookie` and `proxy-authorization` by itself, so without
    // the interceptor a `PUBLIC_GATEWAY_IPFS_EXTRA_HEADER` API key would follow the gateway to
    // whatever origin it points at.
    const elsewhere = await startHeaderRecordingServer(res => {
      res.statusCode = 200;
      res.end('{"name":"elsewhere"}');
    });
    const gateway = await startHeaderRecordingServer(res => {
      res.statusCode = 302;
      res.setHeader('location', elsewhere.url);
      res.end();
    });
    try {
      const result = await fetchMetadata(new URL(gateway.url), 'ABCD.test', 1n, {
        'X-Api-Key': 'gateway-secret',
      });
      assert.equal(result, '{"name":"elsewhere"}');
      assert.equal(gateway.seen[0]['x-api-key'], 'gateway-secret', 'the gateway still gets it');
      assert.equal(elsewhere.seen.length, 1);
      assert.equal(elsewhere.seen[0]['x-api-key'], undefined, 'the next origin must not');
    } finally {
      await gateway.close();
      await elsewhere.close();
    }
  });
});

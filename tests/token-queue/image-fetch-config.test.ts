// `IMAGE_FETCH_HTTP_AGENT` is built once, when `image-cache.ts` is first imported, so its payload
// limit is fixed from `ENV` at that moment. Setting the variable here and importing everything
// dynamically is what lets this file pick a limit small enough to assert against. Every test file
// gets its own process, so this affects nothing else.
process.env.IMAGE_CACHE_MAX_BYTE_SIZE = '2000';

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';

describe('Image fetch agent configuration', () => {
  let startTestHttpServer: typeof import('../helpers.js').startTestHttpServer;
  let startHeaderRecordingServer: typeof import('../helpers.js').startHeaderRecordingServer;
  let processImageCache: typeof import('../../src/token-processor/images/image-cache.js').processImageCache;
  let errors: typeof import('../../src/token-processor/util/errors.js');
  let ENV: typeof import('../../src/env.js').ENV;
  let server: Awaited<ReturnType<typeof startTestHttpServer>>;

  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';

  before(async () => {
    ({ startTestHttpServer, startHeaderRecordingServer } = await import('../helpers.js'));
    ({ processImageCache } = await import('../../src/token-processor/images/image-cache.js'));
    errors = await import('../../src/token-processor/util/errors.js');
    ({ ENV } = await import('../../src/env.js'));
    server = await startTestHttpServer();
  });

  after(async () => {
    await server.close();
  });

  test('applies IMAGE_CACHE_MAX_BYTE_SIZE to the downloaded image', async () => {
    server.serve('/big.png', { body: 'x'.repeat(5000) });
    await assert.rejects(
      processImageCache(server.urlFor('/big.png'), contract, 100n),
      errors.ImageSizeExceededError
    );
  });

  test('accepts a payload under the limit', async () => {
    // The body is not a real image, so this still fails — in `sharp`, once the download has been
    // let through. Asserting on what it is *not* is what shows the limit stayed out of the way.
    server.serve('/small.png', { body: 'x'.repeat(500) });
    await assert.rejects(processImageCache(server.urlFor('/small.png'), contract, 100n), error => {
      assert.ok(
        !(error instanceof errors.ImageSizeExceededError),
        'a payload under the limit must not be rejected for its size'
      );
      return true;
    });
  });

  test('strips gateway headers when a redirect leaves the origin', async () => {
    // `fetch` follows redirects itself and sheds only `authorization` across origins, so the
    // arbitrary header `PUBLIC_GATEWAY_IPFS_EXTRA_HEADER` allows would otherwise follow the gateway
    // to wherever it points. The body never has to decode as an image for this to be worth
    // asserting; the download is what carries the secret.
    const elsewhere = await startHeaderRecordingServer(res => {
      res.statusCode = 200;
      res.end('not an image');
    });
    const gateway = await startHeaderRecordingServer(res => {
      res.statusCode = 302;
      res.setHeader('location', elsewhere.url);
      res.end();
    });
    ENV.PUBLIC_GATEWAY_IPFS = gateway.url.replace(/\/$/, '');
    ENV.PUBLIC_GATEWAY_IPFS_EXTRA_HEADER = 'X-Api-Key: gateway-secret';
    try {
      await processImageCache('ipfs://QmTest/img.png', contract, 100n).catch(() => undefined);
      assert.equal(gateway.seen[0]['x-api-key'], 'gateway-secret', 'the gateway still gets it');
      assert.equal(elsewhere.seen.length, 1);
      assert.equal(elsewhere.seen[0]['x-api-key'], undefined, 'the next origin must not');
    } finally {
      await gateway.close();
      await elsewhere.close();
    }
  });

  test('keeps gateway headers on a same-origin redirect', async () => {
    const gateway = await startHeaderRecordingServer(res => {
      if (res.req.url === '/moved') {
        res.statusCode = 200;
        res.end('not an image');
        return;
      }
      res.statusCode = 302;
      res.setHeader('location', '/moved');
      res.end();
    });
    ENV.PUBLIC_GATEWAY_IPFS = gateway.url.replace(/\/$/, '');
    ENV.PUBLIC_GATEWAY_IPFS_EXTRA_HEADER = 'X-Api-Key: gateway-secret';
    try {
      await processImageCache('ipfs://QmTest/img.png', contract, 100n).catch(() => undefined);
      assert.equal(gateway.seen.length, 2);
      assert.equal(gateway.seen[1]['x-api-key'], 'gateway-secret');
    } finally {
      await gateway.close();
    }
  });
});

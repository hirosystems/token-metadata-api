// `IMAGE_FETCH_HTTP_AGENT` is built once, when `image-cache.ts` is first imported, so its payload
// limit is fixed from `ENV` at that moment. Setting the variable here and importing everything
// dynamically is what lets this file pick a limit small enough to assert against. Every test file
// gets its own process, so this affects nothing else.
process.env.IMAGE_CACHE_MAX_BYTE_SIZE = '2000';

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';

describe('Image fetch agent configuration', () => {
  let startTestHttpServer: typeof import('../helpers.js').startTestHttpServer;
  let processImageCache: typeof import('../../src/token-processor/images/image-cache.js').processImageCache;
  let errors: typeof import('../../src/token-processor/util/errors.js');
  let server: Awaited<ReturnType<typeof startTestHttpServer>>;

  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';

  before(async () => {
    ({ startTestHttpServer } = await import('../helpers.js'));
    ({ processImageCache } = await import('../../src/token-processor/images/image-cache.js'));
    errors = await import('../../src/token-processor/util/errors.js');
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
});

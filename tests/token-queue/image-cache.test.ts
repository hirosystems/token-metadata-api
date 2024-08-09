import * as http from 'http';
import { ENV } from '../../src/env';
import { processImageCache } from '../../src/token-processor/images/image-cache';
import { createTimeoutServer } from '../helpers';
import { MetadataTimeoutError } from '../../src/token-processor/util/errors';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;

  describe('fetch timeout', () => {
    let server: http.Server;

    beforeAll(done => {
      ENV.METADATA_FETCH_TIMEOUT_MS = 50;
      server = createTimeoutServer(100);
      server.listen(9999, 'localhost', done);
    });

    test('throws image fetch timeout error', async () => {
      await expect(
        processImageCache('http://localhost:9999/', contract, tokenNumber)
      ).rejects.toThrow(MetadataTimeoutError);
    });

    afterAll(done => {
      server.close(done);
    });
  });

  // test('ignores data: URL', async () => {
  //   const url = 'data:123456';
  //   const transformed = await processImageCache(url, contract, tokenNumber);
  //   expect(transformed).toStrictEqual(['data:123456']);
  // });

  // test('ignores empty script paths', async () => {
  //   ENV.METADATA_IMAGE_CACHE_PROCESSOR = '';
  //   const transformed = await processImageCache(url, contract, tokenNumber);
  //   expect(transformed).toStrictEqual([url]);
  // });

  // test('handles script errors', async () => {
  //   ENV.METADATA_IMAGE_CACHE_PROCESSOR = './tests/test-image-cache-error.js';
  //   await expect(processImageCache(url, contract, tokenNumber)).rejects.toThrow(
  //     /ImageCache script error/
  //   );
  // });
});

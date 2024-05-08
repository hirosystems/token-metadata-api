import { ENV } from '../src/env';
import { processImageCache } from '../src/token-processor/util/image-cache';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;
  const url = 'http://cloudflare-ipfs.com/test/image.png';

  beforeAll(() => {
    ENV.METADATA_IMAGE_CACHE_PROCESSOR = './tests/test-image-cache.js';
  });

  test('transforms image URL correctly', async () => {
    const transformed = await processImageCache(url, contract, tokenNumber);
    expect(transformed).toStrictEqual([
      'http://cloudflare-ipfs.com/test/image.png?processed=true',
      'http://cloudflare-ipfs.com/test/image.png?processed=true&thumb=true',
    ]);
  });

  test('ignores data: URL', async () => {
    const url = 'data:123456';
    const transformed = await processImageCache(url, contract, tokenNumber);
    expect(transformed).toStrictEqual(['data:123456']);
  });

  test('ignores empty script paths', async () => {
    ENV.METADATA_IMAGE_CACHE_PROCESSOR = '';
    const transformed = await processImageCache(url, contract, tokenNumber);
    expect(transformed).toStrictEqual([url]);
  });

  test('handles script errors', async () => {
    ENV.METADATA_IMAGE_CACHE_PROCESSOR = './tests/test-image-cache-error.js';
    await expect(processImageCache(url, contract, tokenNumber)).rejects.toThrow(/ImageCache error/);
  });
});

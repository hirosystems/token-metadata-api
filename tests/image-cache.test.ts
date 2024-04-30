import { ENV } from '../src/env';
import { processImageUrl } from '../src/token-processor/util/image-cache';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;

  beforeAll(() => {
    ENV.METADATA_IMAGE_CACHE_PROCESSOR = './tests/test-image-cache.js';
  });

  test('transforms image URL correctly', async () => {
    const url = 'http://cloudflare-ipfs.com/test/image.png';
    const transformed = await processImageUrl(url, contract, tokenNumber);
    expect(transformed).toStrictEqual([
      'http://cloudflare-ipfs.com/test/image.png?processed=true',
      'http://cloudflare-ipfs.com/test/image.png?processed=true&thumb=true',
    ]);
  });

  test('ignores data: URL', async () => {
    const url = 'data:123456';
    const transformed = await processImageUrl(url, contract, tokenNumber);
    expect(transformed).toStrictEqual(['data:123456']);
  });

  test('ignores empty script paths', async () => {
    ENV.METADATA_IMAGE_CACHE_PROCESSOR = '';
    const url = 'http://cloudflare-ipfs.com/test/image.png';
    const transformed = await processImageUrl(url, contract, tokenNumber);
    expect(transformed).toStrictEqual([url]);
  });
});

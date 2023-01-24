import { ENV } from '../src/env';
import { processImageUrl } from '../src/token-processor/util/image-cache';

describe('Image cache', () => {
  beforeAll(() => {
    ENV.METADATA_IMAGE_CACHE_PROCESSOR = './tests/test-image-cache.js';
  });

  test('transforms image URL correctly', async () => {
    const url = 'http://cloudflare-ipfs.com/test/image.png';
    const transformed = await processImageUrl(url);
    expect(transformed).toBe('http://cloudflare-ipfs.com/test/image.png?processed=true');
  });

  test('ignores data: URL', async () => {
    const url = 'data:123456';
    const transformed = await processImageUrl(url);
    expect(transformed).toBe('data:123456');
  });

  test('ignores empty script paths', async () => {
    ENV.METADATA_IMAGE_CACHE_PROCESSOR = '';
    const url = 'http://cloudflare-ipfs.com/test/image.png';
    const transformed = await processImageUrl(url);
    expect(transformed).not.toBe('http://cloudflare-ipfs.com/test/image.png?processed=true');
  });
});

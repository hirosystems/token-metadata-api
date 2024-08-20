import { ENV } from '../../src/env';
import { processImageCache } from '../../src/token-processor/images/image-cache';
import { closeTestServer, startTestResponseServer, startTimeoutServer } from '../helpers';
import {
  MetadataHttpError,
  MetadataTimeoutError,
  TooManyRequestsHttpError,
} from '../../src/token-processor/util/errors';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;

  beforeAll(() => {
    ENV.IMAGE_CACHE_PROCESSOR_ENABLED = true;
    ENV.IMAGE_CACHE_GCS_BUCKET_NAME = 'test';
    ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX = 'prefix/';
  });

  test('throws image fetch timeout error', async () => {
    ENV.METADATA_FETCH_TIMEOUT_MS = 50;
    const server = await startTimeoutServer(100);
    await expect(
      processImageCache('http://127.0.0.1:9999/', contract, tokenNumber)
    ).rejects.toThrow(MetadataTimeoutError);
    await closeTestServer(server);
  }, 10000);

  test('throws rate limit error', async () => {
    const server = await startTestResponseServer('rate limit exceeded', 429);
    await expect(
      processImageCache('http://127.0.0.1:9999/', contract, tokenNumber)
    ).rejects.toThrow(TooManyRequestsHttpError);
    await closeTestServer(server);
  }, 10000);

  test('throws other server errors', async () => {
    const server = await startTestResponseServer('not found', 404);
    await expect(
      processImageCache('http://127.0.0.1:9999/', contract, tokenNumber)
    ).rejects.toThrow(MetadataHttpError);
    await closeTestServer(server);
  }, 10000);

  test('ignores data: URL', async () => {
    const url = 'data:123456';
    await expect(processImageCache(url, contract, tokenNumber)).resolves.toStrictEqual([
      'data:123456',
    ]);
  });
});

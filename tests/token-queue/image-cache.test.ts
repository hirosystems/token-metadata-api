import { ENV } from '../../src/env';
import { processImageCache } from '../../src/token-processor/images/image-cache';
import { createTestResponseServer, createTimeoutServer } from '../helpers';
import {
  HttpError,
  MetadataTimeoutError,
  TooManyRequestsHttpError,
} from '../../src/token-processor/util/errors';
import { waiter } from '@hirosystems/api-toolkit';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;

  test('throws image fetch timeout error', async () => {
    ENV.METADATA_FETCH_TIMEOUT_MS = 50;
    const server = createTimeoutServer(100);
    const serverReady = waiter();
    server.listen(9999, 'localhost', () => serverReady.finish());
    await serverReady;

    await expect(
      processImageCache('http://localhost:9999/', contract, tokenNumber)
    ).rejects.toThrow(MetadataTimeoutError);

    const serverDone = waiter();
    server.close(() => serverDone.finish());
    await serverDone;
  });

  test('throws rate limit error', async () => {
    const server = createTestResponseServer('rate limit exceeded', 429);
    const serverReady = waiter();
    server.listen(9999, 'localhost', () => serverReady.finish());
    await serverReady;

    await expect(
      processImageCache('http://localhost:9999/', contract, tokenNumber)
    ).rejects.toThrow(TooManyRequestsHttpError);

    const serverDone = waiter();
    server.close(() => serverDone.finish());
    await serverDone;
  });

  test('throws other server errors', async () => {
    const server = createTestResponseServer('not found', 404);
    const serverReady = waiter();
    server.listen(9999, 'localhost', () => serverReady.finish());
    await serverReady;

    await expect(
      processImageCache('http://localhost:9999/', contract, tokenNumber)
    ).rejects.toThrow(HttpError);

    const serverDone = waiter();
    server.close(() => serverDone.finish());
    await serverDone;
  });

  test('ignores data: URL', async () => {
    const url = 'data:123456';
    await expect(processImageCache(url, contract, tokenNumber)).resolves.toStrictEqual([
      'data:123456',
    ]);
  });

  test('ima', async () => {
    const server = createTestResponseServer('success');
    const serverReady = waiter();
    server.listen(9999, 'localhost', () => serverReady.finish());
    await serverReady;

    await expect(
      processImageCache('http://localhost:9999/', contract, tokenNumber)
    ).rejects.toThrow(HttpError);

    const serverDone = waiter();
    server.close(() => serverDone.finish());
    await serverDone;
  });
});

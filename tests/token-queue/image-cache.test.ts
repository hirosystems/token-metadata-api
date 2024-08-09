import { ENV } from '../../src/env';
import { processImageCache } from '../../src/token-processor/images/image-cache';
import { startTestResponseServer, startTimeoutServer } from '../helpers';
import {
  HttpError,
  MetadataTimeoutError,
  TooManyRequestsHttpError,
} from '../../src/token-processor/util/errors';
import { waiter } from '@hirosystems/api-toolkit';
import { MockAgent, setGlobalDispatcher } from 'undici';

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
    try {
      await expect(
        processImageCache('http://127.0.0.1:9999/', contract, tokenNumber)
      ).rejects.toThrow(MetadataTimeoutError);
    } finally {
      const serverDone = waiter();
      server.close(() => serverDone.finish());
      await serverDone;
    }
  });

  test('throws rate limit error', async () => {
    const server = await startTestResponseServer('rate limit exceeded', 429);
    try {
      await expect(
        processImageCache('http://127.0.0.1:9999/', contract, tokenNumber)
      ).rejects.toThrow(TooManyRequestsHttpError);
    } finally {
      const serverDone = waiter();
      server.close(() => serverDone.finish());
      await serverDone;
    }
  });

  test('throws other server errors', async () => {
    const server = await startTestResponseServer('not found', 404);
    try {
      await expect(
        processImageCache('http://127.0.0.1:9999/', contract, tokenNumber)
      ).rejects.toThrow(HttpError);
    } finally {
      const serverDone = waiter();
      server.close(() => serverDone.finish());
      await serverDone;
    }
  });

  test('ignores data: URL', async () => {
    const url = 'data:123456';
    await expect(processImageCache(url, contract, tokenNumber)).resolves.toStrictEqual([
      'data:123456',
    ]);
  });

  // test('throws upload error', async () => {
  //   const server = createTestResponseServer('success');
  //   const serverReady = waiter();
  //   server.listen(9999, 'localhost', () => serverReady.finish());
  //   await serverReady;

  //   const agent = new MockAgent();
  //   agent.disableNetConnect();
  //   agent
  //     .get('http://metadata.google.internal')
  //     .intercept({
  //       path: '/computeMetadata/v1/instance/service-accounts/default/token',
  //       method: 'GET',
  //     })
  //     .reply(200, { access_token: 'test' });
  //   agent
  //     .get('https://storage.googleapis.com')
  //     .intercept({
  //       path: '/*',
  //       method: 'POST',
  //     })
  //     .reply(500)
  //     .persist();
  //   setGlobalDispatcher(agent);

  //   await expect(
  //     processImageCache('http://localhost:9999/', contract, tokenNumber)
  //   ).rejects.toThrow(HttpError);

  //   const serverDone = waiter();
  //   server.close(() => serverDone.finish());
  //   await serverDone;
  // });
});

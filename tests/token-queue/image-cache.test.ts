import { strict as assert } from 'node:assert';
import { ENV } from '../../src/env.js';
import { processImageCache } from '../../src/token-processor/images/image-cache.js';
import { startTestHttpServer } from '../helpers.js';
import {
  ImageHttpError,
  ImageTimeoutError,
  TooManyRequestsHttpError,
} from '../../src/token-processor/util/errors.js';
import { before, describe, test } from 'node:test';

describe('Image cache', () => {
  const contract = 'SP3QSAJQ4EA8WXEDSRRKMZZ29NH91VZ6C5X88FGZQ.crashpunks-v2';
  const tokenNumber = 100n;

  before(() => {
    ENV.IMAGE_CACHE_PROCESSOR_ENABLED = true;
    ENV.IMAGE_CACHE_UPLOAD_PROVIDER = 'gcs';
    ENV.IMAGE_CACHE_GCS_BUCKET_NAME = 'test';
    ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX = 'prefix/';
  });

  test('throws image fetch timeout error', async () => {
    ENV.METADATA_FETCH_TIMEOUT_MS = 50;
    const server = await startTestHttpServer({ '/': { delayMs: 100, body: 'Delayed response' } });
    try {
      await assert.rejects(processImageCache(server.url, contract, tokenNumber), ImageTimeoutError);
    } finally {
      await server.close();
    }
  });

  test('throws rate limit error', async () => {
    const server = await startTestHttpServer({
      '/': { status: 429, body: 'rate limit exceeded' },
    });
    try {
      await assert.rejects(
        processImageCache(server.url, contract, tokenNumber),
        TooManyRequestsHttpError
      );
    } finally {
      await server.close();
    }
  });

  test('throws other server errors', async () => {
    const server = await startTestHttpServer({ '/': { status: 404, body: 'not found' } });
    try {
      await assert.rejects(processImageCache(server.url, contract, tokenNumber), ImageHttpError);
    } finally {
      await server.close();
    }
  });
});

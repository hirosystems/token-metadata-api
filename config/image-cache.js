#!/usr/bin/env node

/**
 * This script is used to upload token metadata images to a Google Cloud Storage bucket. It also
 * provides the option to resize an image to a max width before uploading so file sizes are more
 * manageable upon display.
 *
 * The following arguments are taken in order from `argv`:
 * * Remote image URL
 * * Smart Contract principal
 * * Token number
 *
 * Functionality can be tweaked with the following ENV vars:
 * * `IMAGE_CACHE_MAX_BYTE_SIZE`: Max payload size accepted when downloading remote images.
 * * `IMAGE_CACHE_RESIZE_WIDTH`: Width to resize images into while preserving aspect ratio.
 * * `IMAGE_CACHE_GCS_BUCKET_NAME`: Google Cloud Storage bucket name. Example: 'assets.dev.hiro.so'
 * * `IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX`: Path for object storage inside the bucket. Example:
 *   'token-metadata-api/mainnet/'
 * * `IMAGE_CACHE_GCS_AUTH_TOKEN`: Google Cloud Storage authorization token. If undefined, the token
 *   will be fetched dynamically from Google.
 * * `IMAGE_CACHE_CDN_BASE_PATH`: Base path for URLs that will be returned to the API for storage.
 *   Example: 'https://assets.dev.hiro.so/token-metadata-api/mainnet/'
 */

const sharp = require('sharp');
const { request, fetch, Agent } = require('undici');
const { Readable, PassThrough } = require('node:stream');

const IMAGE_URL = process.argv[2];
const CONTRACT_PRINCIPAL = process.argv[3];
const TOKEN_NUMBER = process.argv[4];

const IMAGE_RESIZE_WIDTH = parseInt(process.env['IMAGE_CACHE_RESIZE_WIDTH'] ?? '300');
const GCS_BUCKET_NAME = process.env['IMAGE_CACHE_GCS_BUCKET_NAME'];
const GCS_OBJECT_NAME_PREFIX = process.env['IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX'];
const CDN_BASE_PATH = process.env['IMAGE_CACHE_CDN_BASE_PATH'];
const TIMEOUT = parseInt(process.env['METADATA_FETCH_TIMEOUT_MS'] ?? '30000');
const MAX_REDIRECTIONS = parseInt(process.env['METADATA_FETCH_MAX_REDIRECTIONS'] ?? '0');
const MAX_RESPONSE_SIZE = parseInt(process.env['IMAGE_CACHE_MAX_BYTE_SIZE'] ?? '-1');

async function getGcsAuthToken() {
  const envToken = process.env['IMAGE_CACHE_GCS_AUTH_TOKEN'];
  if (envToken !== undefined) return envToken;
  try {
    const response = await request(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        method: 'GET',
        headers: { 'Metadata-Flavor': 'Google' },
        throwOnError: true,
      }
    );
    const json = await response.body.json();
    // Cache the token so we can reuse it for other images.
    process.env['IMAGE_CACHE_GCS_AUTH_TOKEN'] = json.access_token;
    return json.access_token;
  } catch (error) {
    throw new Error(`GCS access token error: ${error}`);
  }
}

async function upload(stream, name, authToken) {
  await request(
    `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET_NAME}/o?uploadType=media&name=${GCS_OBJECT_NAME_PREFIX}${name}`,
    {
      method: 'POST',
      body: stream,
      headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${authToken}` },
      throwOnError: true,
    }
  );
  return `${CDN_BASE_PATH}${name}`;
}

fetch(
  IMAGE_URL,
  {
    dispatcher: new Agent({
      headersTimeout: TIMEOUT,
      bodyTimeout: TIMEOUT,
      maxRedirections: MAX_REDIRECTIONS,
      maxResponseSize: MAX_RESPONSE_SIZE,
      throwOnError: true,
      connect: {
        rejectUnauthorized: false, // Ignore SSL cert errors.
      },
    }),
  },
  ({ body }) => body
)
  .then(async response => {
    const imageReadStream = Readable.fromWeb(response.body);
    const passThrough = new PassThrough();
    const fullSizeTransform = sharp().png();
    const thumbnailTransform = sharp()
      .resize({ width: IMAGE_RESIZE_WIDTH, withoutEnlargement: true })
      .png();
    imageReadStream.pipe(passThrough);
    passThrough.pipe(fullSizeTransform);
    passThrough.pipe(thumbnailTransform);

    let didRetryUnauthorized = false;
    while (true) {
      const authToken = await getGcsAuthToken();
      try {
        const results = await Promise.all([
          upload(fullSizeTransform, `${CONTRACT_PRINCIPAL}/${TOKEN_NUMBER}.png`, authToken),
          upload(thumbnailTransform, `${CONTRACT_PRINCIPAL}/${TOKEN_NUMBER}-thumb.png`, authToken),
        ]);
        for (const r of results) console.log(r);
        break;
      } catch (error) {
        if (
          !didRetryUnauthorized &&
          error.cause &&
          error.cause.code == 'UND_ERR_RESPONSE_STATUS_CODE' &&
          (error.cause.statusCode === 401 || error.cause.statusCode === 403)
        ) {
          // GCS token is probably expired. Force a token refresh before trying again.
          process.env['IMAGE_CACHE_GCS_AUTH_TOKEN'] = undefined;
          didRetryUnauthorized = true;
        } else throw error;
      }
    }
  })
  .catch(error => {
    console.error(error);
    let exitCode = 1;
    if (
      error.cause &&
      (error.cause.code == 'UND_ERR_HEADERS_TIMEOUT' ||
        error.cause.code == 'UND_ERR_BODY_TIMEOUT' ||
        error.cause.code == 'UND_ERR_CONNECT_TIMEOUT' ||
        error.cause.code == 'ECONNRESET')
    ) {
      exitCode = 2;
    } else if (
      error.cause &&
      error.cause.code == 'UND_ERR_RESPONSE_STATUS_CODE' &&
      error.cause.statusCode === 429
    ) {
      exitCode = 3;
    }
    process.exit(exitCode);
  });

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
const { request, fetch, errors, Agent } = require('undici');
const { Readable, PassThrough } = require('node:stream');

const IMAGE_URL = process.argv[2];
const CONTRACT_PRINCIPAL = process.argv[3];
const TOKEN_NUMBER = process.argv[4];

const IMAGE_RESIZE_WIDTH = parseInt(process.env['IMAGE_CACHE_RESIZE_WIDTH'] ?? '300');
const GCS_BUCKET_NAME = process.env['IMAGE_CACHE_GCS_BUCKET_NAME'];
const GCS_OBJECT_NAME_PREFIX = process.env['IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX'];
const CDN_BASE_PATH = process.env['IMAGE_CACHE_CDN_BASE_PATH'];
const TIMEOUT = parseInt(process.env['METADATA_FETCH_TIMEOUT_MS'] ?? '30');
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
      }
    );
    const json = await response.body.json();
    if (response.statusCode === 200 && json.access_token) {
      // Cache the token so we can reuse it for other images.
      process.env['IMAGE_CACHE_GCS_AUTH_TOKEN'] = json.access_token;
      return json.access_token;
    }
    throw new Error(`GCS access token not found ${response.statusCode}: ${json}`);
  } catch (error) {
    throw new Error(`Error fetching GCS access token: ${error.message}`);
  }
}

async function fetchImage() {
  const response = await fetch(
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
    }
  );
  return response.body;
}

async function upload(stream, name, authToken) {
  try {
    const response = await request(
      `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET_NAME}/o?uploadType=media&name=${GCS_OBJECT_NAME_PREFIX}${name}`,
      {
        method: 'POST',
        body: stream,
        headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${authToken}` },
      }
    );
    if (response.statusCode !== 200) throw new Error(`GCS error: ${response.statusCode}`);
    return `${CDN_BASE_PATH}${name}`;
  } catch (error) {
    throw new Error(`Error uploading ${name}: ${error.message}`);
  }
}

fetchImage()
  .then(async response => {
    const imageReadStream = Readable.fromWeb(response.body);
    const passThrough = new PassThrough();
    const fullSizeTransform = sharp()
      .on('warning', _ => {})
      .png();
    const thumbnailTransform = sharp()
      .on('warning', _ => {})
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
        // The API will read these strings as CDN URLs.
        for (const result of results) console.log(result);
        break;
      } catch (error) {
        if (
          (error.message.endsWith('403') || error.message.endsWith('401')) &&
          !didRetryUnauthorized
        ) {
          // Force a dynamic token refresh and try again.
          process.env['IMAGE_CACHE_GCS_AUTH_TOKEN'] = undefined;
          didRetryUnauthorized = true;
        } else throw error;
      }
    }
    process.exit(0);
  })
  .catch(error => {
    console.error(`Undici fetch error detected`);
    console.error(error);
    if (
      error instanceof errors.HeadersTimeoutError ||
      error instanceof errors.BodyTimeoutError ||
      error instanceof errors.ConnectTimeoutError
    ) {
      process.exit(2);
    } else if (error instanceof errors.ResponseStatusCodeError && error.statusCode === 429) {
      process.exit(3);
    }
    process.exit(1);
  });

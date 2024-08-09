import { ENV } from '../../env';
import { parseDataUrl, getFetchableDecentralizedStorageUrl } from '../util/metadata-helpers';
import { logger } from '@hirosystems/api-toolkit';
import { PgStore } from '../../pg/pg-store';
import { PassThrough, Readable } from 'node:stream';
import * as sharp from 'sharp';
import { Agent, fetch, request, errors, Response } from 'undici';
import {
  HttpError,
  MetadataParseError,
  MetadataTimeoutError,
  TooManyRequestsHttpError,
  UndiciCauseTypeError,
} from '../util/errors';

let gcsAuthToken: string | undefined;

async function getGcsAuthToken(): Promise<string> {
  if (gcsAuthToken !== undefined) return gcsAuthToken;
  try {
    const response = await request(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        method: 'GET',
        headers: { 'Metadata-Flavor': 'Google' },
        throwOnError: true,
      }
    );
    const json = (await response.body.json()) as { access_token: string };
    // Cache the token so we can reuse it for other images.
    gcsAuthToken = json.access_token;
    return json.access_token;
  } catch (error) {
    throw new Error(`GCS access token error: ${error}`);
  }
}

async function uploadToGcs(stream: Readable, name: string, authToken: string) {
  await request(
    `https://storage.googleapis.com/upload/storage/v1/b/${ENV.IMAGE_CACHE_GCS_BUCKET_NAME}/o?uploadType=media&name=${ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX}${name}`,
    {
      method: 'POST',
      body: stream,
      headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${authToken}` },
      throwOnError: true,
    }
  );
  return `${ENV.IMAGE_CACHE_CDN_BASE_PATH}${name}`;
}

/**
 * Uploads processed token metadata images to a Google Cloud Storage bucket. It also provides the
 * option to resize the image to a max width before uploading so file sizes are more manageable upon
 * display.
 *
 * For a list of configuration options, see `env.ts`.
 */
export async function processImageCache(
  imgUrl: string,
  contractPrincipal: string,
  tokenNumber: bigint
): Promise<string[]> {
  logger.info(`ImageCache processing token ${contractPrincipal} (${tokenNumber}) at ${imgUrl}`);
  if (imgUrl.startsWith('data:')) return [imgUrl];

  // Fetch original image.
  let fetchResponse: Response;
  try {
    fetchResponse = await fetch(imgUrl, {
      dispatcher: new Agent({
        headersTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
        bodyTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
        maxRedirections: ENV.METADATA_FETCH_MAX_REDIRECTIONS,
        maxResponseSize: ENV.IMAGE_CACHE_MAX_BYTE_SIZE,
        connect: {
          rejectUnauthorized: false, // Ignore SSL cert errors.
        },
      }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      const typeError = error as UndiciCauseTypeError;
      if (
        typeError.cause instanceof errors.HeadersTimeoutError ||
        typeError.cause instanceof errors.BodyTimeoutError ||
        typeError.cause instanceof errors.ConnectTimeoutError
      ) {
        throw new MetadataTimeoutError(new URL(imgUrl));
      }
    }
    throw new HttpError(`ImageCache fetch error: ${imgUrl}`);
  }
  if (fetchResponse.status == 429) {
    throw new TooManyRequestsHttpError(new URL(imgUrl), new errors.ResponseStatusCodeError());
  }
  const imageBody = fetchResponse.body;
  if (!fetchResponse.ok || !imageBody) {
    throw new HttpError(
      `ImageCache fetch error`,
      new errors.ResponseStatusCodeError(fetchResponse.statusText, fetchResponse.status)
    );
  }

  // Transform image.
  let fullSizeTransform: sharp.Sharp;
  let thumbnailTransform: sharp.Sharp;
  try {
    const imageReadStream = Readable.fromWeb(imageBody);
    const passThrough = new PassThrough();
    fullSizeTransform = sharp().png();
    thumbnailTransform = sharp()
      .resize({ width: ENV.IMAGE_CACHE_RESIZE_WIDTH, withoutEnlargement: true })
      .png();
    imageReadStream.pipe(passThrough);
    passThrough.pipe(fullSizeTransform);
    passThrough.pipe(thumbnailTransform);
  } catch (error) {
    throw new MetadataParseError(`ImageCache error transforming image: ${error}`);
  }

  let didRetryUnauthorized = false;
  while (true) {
    const authToken = await getGcsAuthToken();
    try {
      const results = await Promise.all([
        uploadToGcs(fullSizeTransform, `${contractPrincipal}/${tokenNumber}.png`, authToken),
        uploadToGcs(thumbnailTransform, `${contractPrincipal}/${tokenNumber}-thumb.png`, authToken),
      ]);
      return results;
    } catch (error) {
      if (
        !didRetryUnauthorized &&
        error instanceof errors.ResponseStatusCodeError &&
        (error.statusCode === 401 || error.statusCode === 403)
      ) {
        // GCS token is probably expired. Force a token refresh before trying again.
        gcsAuthToken = undefined;
        didRetryUnauthorized = true;
      } else throw new HttpError(`ImageCache upload error`, error);
    }
  }
}

/**
 * Converts a raw image URI from metadata into a fetchable URL.
 * @param uri - Original image URI
 * @returns Normalized URL string
 */
export function normalizeImageUri(uri: string): string {
  // Support images embedded in a Data URL
  if (uri.startsWith('data:')) {
    const dataUrl = parseDataUrl(uri);
    if (!dataUrl) {
      throw new MetadataParseError(`Data URL could not be parsed: ${uri}`);
    }
    if (!dataUrl.mediaType?.startsWith('image/')) {
      throw new MetadataParseError(`Token image is a Data URL with a non-image media type: ${uri}`);
    }
    return uri;
  }
  const fetchableUrl = getFetchableDecentralizedStorageUrl(uri);
  return fetchableUrl.toString();
}

export async function reprocessTokenImageCache(
  db: PgStore,
  contractPrincipal: string,
  tokenIds?: number[]
): Promise<void> {
  await db.sqlWriteTransaction(async sql => {
    const imageUris = await db.getTokenImageUris(contractPrincipal, tokenIds);
    for (const token of imageUris) {
      try {
        const [cached, thumbnail] = await processImageCache(
          getFetchableDecentralizedStorageUrl(token.image).toString(),
          contractPrincipal,
          BigInt(token.token_number)
        );
        if (cached && thumbnail)
          await db.updateTokenCachedImages(token.token_id, cached, thumbnail);
      } catch (error) {
        logger.error(error, `ImageCache unable to reprocess token image cache`);
      }
    }
  });
}

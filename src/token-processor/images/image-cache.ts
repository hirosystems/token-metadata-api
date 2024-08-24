import { ENV } from '../../env';
import { parseDataUrl, getFetchableDecentralizedStorageUrl } from '../util/metadata-helpers';
import { logger } from '@hirosystems/api-toolkit';
import { PgStore } from '../../pg/pg-store';
import { Readable } from 'node:stream';
import * as sharp from 'sharp';
import * as fs from 'fs';
import { Agent, fetch, errors } from 'undici';
import {
  ImageSizeExceededError,
  ImageTimeoutError,
  TooManyRequestsHttpError,
  UndiciCauseTypeError,
  ImageHttpError,
  ImageParseError,
} from '../util/errors';
import { pipeline } from 'node:stream/promises';
import { Storage } from '@google-cloud/storage';

async function downloadImage(imgUrl: string, tmpPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const filePath = `${tmpPath}/image`;
    fetch(imgUrl, {
      dispatcher: new Agent({
        headersTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
        bodyTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
        maxRedirections: ENV.METADATA_FETCH_MAX_REDIRECTIONS,
        maxResponseSize: ENV.IMAGE_CACHE_MAX_BYTE_SIZE,
        connect: {
          rejectUnauthorized: false, // Ignore SSL cert errors.
        },
      }),
    })
      .then(response => {
        if (response.status == 429) {
          reject(
            new TooManyRequestsHttpError(new URL(imgUrl), new errors.ResponseStatusCodeError())
          );
          return;
        }
        const imageBody = response.body;
        if (!response.ok || !imageBody) {
          reject(
            new ImageHttpError(
              `ImageCache fetch error`,
              new errors.ResponseStatusCodeError(response.statusText, response.status)
            )
          );
          return;
        }
        const imageStream = Readable.fromWeb(imageBody);
        imageStream.on('error', reject);
        const fileStream = fs.createWriteStream(filePath);
        fileStream.on('error', reject);
        pipeline(imageStream, fileStream)
          .then(_ => resolve(filePath))
          .catch(reject);
      })
      .catch(reject);
  });
}

async function transformImage(filePath: string, resize: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const outPath = resize ? `${filePath}-small.png` : `${filePath}.png`;
    let sharpStream = sharp(filePath, {
      failOn: 'error',
      // TODO: This ignores multi-frame GIF formats to optimize memory and because we're converting
      // to PNG anyway. We should support animated images in the future.
      pages: 1,
      page: 0,
      animated: false,
    });
    if (resize) {
      sharpStream = sharpStream.resize({
        width: ENV.IMAGE_CACHE_RESIZE_WIDTH,
        withoutEnlargement: true,
      });
    }
    sharpStream.on('error', reject);
    sharpStream = sharpStream.png().toFile(outPath, (err, _info) => {
      if (err) reject(err);
      else resolve(outPath);
    });
  });
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

  try {
    const gcs = new Storage();
    const gcsBucket = ENV.IMAGE_CACHE_GCS_BUCKET_NAME as string;

    const tmpPath = `tmp/${contractPrincipal}_${tokenNumber}`;
    fs.mkdirSync(tmpPath, { recursive: true });
    const original = await downloadImage(imgUrl, tmpPath);

    const image1 = await transformImage(original);
    const remoteName1 = `${contractPrincipal}/${tokenNumber}.png`;
    await gcs.bucket(gcsBucket).upload(image1, {
      destination: `${ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX}${remoteName1}`,
    });

    const image2 = await transformImage(original, true);
    const remoteName2 = `${contractPrincipal}/${tokenNumber}-thumb.png`;
    await gcs.bucket(gcsBucket).upload(image2, {
      destination: `${ENV.IMAGE_CACHE_GCS_OBJECT_NAME_PREFIX}${remoteName2}`,
    });

    fs.rmSync(tmpPath, { force: true, recursive: true });
    return [
      `${ENV.IMAGE_CACHE_CDN_BASE_PATH}${remoteName1}`,
      `${ENV.IMAGE_CACHE_CDN_BASE_PATH}${remoteName2}`,
    ];
  } catch (error) {
    if (error instanceof TypeError) {
      const typeError = error as UndiciCauseTypeError;
      if (
        typeError.cause instanceof errors.HeadersTimeoutError ||
        typeError.cause instanceof errors.BodyTimeoutError ||
        typeError.cause instanceof errors.ConnectTimeoutError
      ) {
        throw new ImageTimeoutError(new URL(imgUrl));
      }
      if (typeError.cause instanceof errors.ResponseExceededMaxSizeError) {
        throw new ImageSizeExceededError(`ImageCache image too large: ${imgUrl}`);
      }
    }
    throw error;
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
      throw new ImageParseError(`Data URL could not be parsed: ${uri}`);
    }
    if (!dataUrl.mediaType?.startsWith('image/')) {
      throw new ImageParseError(`Token image is a Data URL with a non-image media type: ${uri}`);
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

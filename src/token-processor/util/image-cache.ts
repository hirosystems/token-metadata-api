import * as child_process from 'child_process';
import { ENV } from '../../env';
import { MetadataParseError, MetadataTimeoutError, TooManyRequestsHttpError } from './errors';
import { parseDataUrl, getFetchableDecentralizedStorageUrl } from './metadata-helpers';
import { logger } from '@hirosystems/api-toolkit';
import { PgStore } from '../../pg/pg-store';
import { errors } from 'undici';

/**
 * If an external image processor script is configured in the `METADATA_IMAGE_CACHE_PROCESSOR` ENV
 * var, this function will process the given image URL for the purpose of caching on a CDN (or
 * whatever else it may be created to do). The script is expected to return a new URL for the image
 * via `stdout`, with an optional 2nd line with another URL for a thumbnail version of the same
 * cached image. If the script is not configured, then the original URL is returned immediately. If
 * a data-uri is passed, it is also immediately returned without being passed to the script.
 *
 * The Image Cache script must return a status code of `0` to mark a successful cache. Other code
 * returns available are:
 * * `1`: A generic error occurred. Cache should not be retried.
 * * `2`: Image fetch timed out before caching was possible. Should be retried.
 * * `3`: Image fetch failed due to rate limits from the remote server. Should be retried.
 */
export async function processImageCache(
  imgUrl: string,
  contractPrincipal: string,
  tokenNumber: bigint
): Promise<string[]> {
  const imageCacheProcessor = ENV.METADATA_IMAGE_CACHE_PROCESSOR;
  if (!imageCacheProcessor || imgUrl.startsWith('data:')) return [imgUrl];
  logger.info(`ImageCache processing token ${contractPrincipal} (${tokenNumber}) at ${imgUrl}`);
  const { code, stdout, stderr } = await callImageCacheScript(
    imageCacheProcessor,
    imgUrl,
    contractPrincipal,
    tokenNumber
  );
  switch (code) {
    case 0:
      try {
        // Script was successful. Report results back to metadata processor.
        const urls = stdout
          .trim()
          .split('\n')
          .map(r => new URL(r).toString());
        logger.info(urls, `ImageCache processed token ${contractPrincipal} (${tokenNumber})`);
        return urls;
      } catch (error) {
        throw new Error(
          `Image processing script returned an invalid url for ${imgUrl} with stdout: ${stdout}, stderr: ${stderr}`
        );
      }
    case 2:
      // This should be retryable.
      throw new MetadataTimeoutError(imgUrl);
    case 3:
      // We got rate limited during the image fetch. Report this as a retryable error with a
      // synthetic rate limit error.
      throw new TooManyRequestsHttpError(new URL(imgUrl), new errors.ResponseStatusCodeError());
    default:
      throw new Error(`ImageCache script error (code ${code}): ${stderr}`);
  }
}

async function callImageCacheScript(
  imageCacheProcessor: string,
  imgUrl: string,
  contractPrincipal: string,
  tokenNumber: bigint
): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const repoDir = process.cwd();
  return await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>(resolve => {
    const cp = child_process.spawn(
      imageCacheProcessor,
      [imgUrl, contractPrincipal, tokenNumber.toString()],
      { cwd: repoDir }
    );
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', data => (stdout += data));
    cp.stderr.on('data', data => (stderr += data));
    cp.on('close', code => resolve({ code: code ?? 0, stdout, stderr }));
  });
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

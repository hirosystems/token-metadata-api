import * as child_process from 'child_process';
import { ENV } from '../../env';
import { MetadataParseError } from './errors';
import { parseDataUrl, getFetchableUrl } from './metadata-helpers';
import { logger } from '@hirosystems/api-toolkit';
import { PgStore } from '../../pg/pg-store';

/**
 * If an external image processor script is configured, then it will process the given image URL for
 * the purpose of caching on a CDN (or whatever else it may be created to do). The script is
 * expected to return a new URL for the image. If the script is not configured, then the original
 * URL is returned immediately. If a data-uri is passed, it is also immediately returned without
 * being passed to the script.
 */
export async function processImageUrl(
  imgUrl: string,
  contractPrincipal: string,
  tokenNumber: bigint
): Promise<string[]> {
  const imageCacheProcessor = ENV.METADATA_IMAGE_CACHE_PROCESSOR;
  if (!imageCacheProcessor) {
    return [imgUrl];
  }
  if (imgUrl.startsWith('data:')) {
    return [imgUrl];
  }
  logger.info(`ImageCache processing image for token ${contractPrincipal} (${tokenNumber})...`);
  const repoDir = process.cwd();
  const { code, stdout, stderr } = await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
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
    cp.on('error', error => reject(error));
  });
  if (code !== 0 && stderr) {
    logger.warn(stderr, `ImageCache error`);
  }
  const result = stdout.trim().split('\n');
  try {
    return result.map(r => new URL(r).toString());
  } catch (error) {
    throw new Error(
      `Image processing script returned an invalid url for ${imgUrl}: ${result}, stderr: ${stderr}`
    );
  }
}

export function getImageUrl(uri: string): string {
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
  const fetchableUrl = getFetchableUrl(uri);
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
        const [cached, thumbnail] = await processImageUrl(
          getFetchableUrl(token.image).toString(),
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

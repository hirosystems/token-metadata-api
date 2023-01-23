import * as querystring from 'querystring';
import * as child_process from 'child_process';
import * as path from 'path';
import { fetch } from 'undici';
import {
  DbMetadataAttributeInsert,
  DbMetadataInsert,
  DbMetadataLocaleInsertBundle,
  DbMetadataPropertyInsert,
  DbToken,
} from '../../pg/types';
import { ENV } from '../../env';
import { TextDecoder } from 'util';
import {
  HttpError,
  MetadataParseError,
  MetadataSizeExceededError,
  MetadataTimeoutError,
} from './errors';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { Static, Type } from '@sinclair/typebox';
import { logger } from '../../logger';

/**
 * Raw metadata object types. We will allow `any` types here and validate each field towards its
 * expected value later.
 */
const RawMetadata = Type.Object(
  {
    name: Type.Optional(Type.Any()),
    description: Type.Optional(Type.Any()),
    image: Type.Optional(Type.Any()),
    attributes: Type.Optional(Type.Any()),
    properties: Type.Optional(Type.Any()),
    localization: Type.Optional(Type.Any()),
    // Properties below are not SIP-016 compliant.
    imageUrl: Type.Optional(Type.Any()),
    image_url: Type.Optional(Type.Any()),
  },
  { additionalProperties: true }
);
type RawMetadataType = Static<typeof RawMetadata>;
const RawMetadataCType = TypeCompiler.Compile(RawMetadata);

// Raw metadata localization types.
const RawMetadataLocalization = Type.Object({
  uri: Type.String(),
  default: Type.String(),
  locales: Type.Array(Type.String()),
});
const RawMetadataLocalizationCType = TypeCompiler.Compile(RawMetadataLocalization);

// Raw metadata attribute types.
const RawMetadataAttribute = Type.Object({
  trait_type: Type.String(),
  value: Type.Any(),
  display_type: Type.Optional(Type.String()),
});
const RawMetadataAttributes = Type.Array(RawMetadataAttribute);
const RawMetadataAttributesCType = TypeCompiler.Compile(RawMetadataAttributes);

// Raw metadata property types.
const RawMetadataProperties = Type.Record(Type.String(), Type.Any());
const RawMetadataPropertiesCType = TypeCompiler.Compile(RawMetadataProperties);

type RawMetadataLocale = {
  metadata: RawMetadataType;
  locale?: string;
  default: boolean;
  uri: string;
};

/**
 * Fetches all the localized metadata JSONs for a token. First, it downloads the default metadata
 * JSON and parses it looking for other localizations. If those are found, each of them is then
 * downloaded, parsed, and returned for DB insertion.
 * @param uri - token metadata URI
 * @param token - token DB entry
 * @returns parsed metadata ready for insertion
 */
export async function fetchAllMetadataLocalesFromBaseUri(
  uri: string,
  token: DbToken
): Promise<DbMetadataLocaleInsertBundle[]> {
  const tokenUri = getTokenSpecificUri(uri, token.token_number);
  const rawMetadataLocales: RawMetadataLocale[] = [];

  const defaultMetadata = await getMetadataFromUri(tokenUri);
  rawMetadataLocales.push({
    metadata: defaultMetadata,
    default: true,
    uri: tokenUri,
  });

  // Does it declare localizations? If so, fetch and parse all of them.
  if (RawMetadataLocalizationCType.Check(defaultMetadata.localization)) {
    const uri = defaultMetadata.localization.uri;
    const locales = defaultMetadata.localization.locales;
    rawMetadataLocales[0].locale = defaultMetadata.localization.default;
    for (const locale of locales) {
      if (locale === rawMetadataLocales[0].locale) {
        // Skip the default, we already have it.
        continue;
      }
      const localeUri = getTokenSpecificUri(uri, token.token_number, locale);
      const localeMetadata = await getMetadataFromUri(localeUri);
      rawMetadataLocales.push({
        metadata: localeMetadata,
        locale: locale,
        default: false,
        uri: localeUri,
      });
    }
  }

  return parseMetadataForInsertion(rawMetadataLocales, token);
}

/**
 * Returns a metadata URI that is specific to a token number within a contract,
 * i.e. replacing `{id}` with the token number and `{locale}` with the given
 * locale.
 * @param uri - Original metadata URI
 * @param tokenNumber - token number
 * @param locale - locale to apply
 * @returns token specific uri string
 */
export function getTokenSpecificUri(uri: string, tokenNumber: bigint, locale?: string): string {
  const tokenNumStr = tokenNumber.toString();
  const localeStr = locale ?? '';
  return (
    uri
      .replaceAll(/{id}/gi, tokenNumStr)
      .replaceAll(/{locale}/gi, localeStr)
      // Patterns below are not SIP-016 compliant.
      .replaceAll(/\$TOKEN_ID/gi, tokenNumStr)
  );
}

async function parseMetadataForInsertion(
  rawMetadataLocales: RawMetadataLocale[],
  token: DbToken
): Promise<DbMetadataLocaleInsertBundle[]> {
  // Keep the default because we may need to fall back into its data.
  let defaultInsert: DbMetadataLocaleInsertBundle | undefined;
  const inserts: DbMetadataLocaleInsertBundle[] = [];
  for (const raw of rawMetadataLocales) {
    const metadata = raw.metadata;
    const name = metadata.name ?? defaultInsert?.metadata.name;
    if (!name) {
      // SIP-016 requires at least `sip` and `name` to be defined.
      continue;
    }
    // Process image URL with `ENV.METADATA_IMAGE_CACHE_PROCESSOR`.
    const image =
      metadata.image ??
      metadata.imageUrl ??
      metadata.image_url ??
      defaultInsert?.metadata.image ??
      null;
    let cachedImage: string | null = null;
    if (image && typeof image === 'string') {
      const normalizedUrl = getImageUrl(image);
      cachedImage = await processImageUrl(normalizedUrl);
    }
    // Localized values override defaults.
    const metadataInsert: DbMetadataInsert = {
      sip: 16,
      token_id: token.id,
      name: name.toString(),
      description:
        metadata.description?.toString() ?? defaultInsert?.metadata.description?.toString() ?? null,
      image: image?.toString(),
      cached_image: cachedImage,
      l10n_default: raw.default,
      l10n_locale: raw.locale ?? null,
      l10n_uri: raw.uri,
    };
    // Localized attributes rewrite all default attributes. No fall back.
    const attributes: DbMetadataAttributeInsert[] = [];
    if (RawMetadataAttributesCType.Check(metadata.attributes)) {
      for (const { trait_type, value, display_type } of metadata.attributes) {
        if (trait_type && value) {
          attributes.push({
            trait_type: trait_type,
            value: value,
            display_type: display_type ?? null,
          });
        }
      }
    }
    // Localized properties only override their default. All others have to fall back to default
    // values.
    const properties: DbMetadataPropertyInsert[] = defaultInsert?.properties ?? [];
    if (RawMetadataPropertiesCType.Check(metadata.properties)) {
      for (const [key, value] of Object.entries(metadata.properties)) {
        if (key && value) {
          const defaultProp = properties.find(p => p.name === key);
          if (defaultProp) {
            defaultProp.value = value;
          } else {
            properties.push({
              name: key,
              value: value,
            });
          }
        }
      }
    }
    inserts.push({
      metadata: metadataInsert,
      attributes: attributes,
      properties: properties,
    });
    if (inserts.length === 1) {
      defaultInsert = inserts[0];
    }
  }
  return inserts;
}

/**
 * Fetches metadata while monitoring timeout and size limits. Throws if any is reached.
 * Taken from https://github.com/node-fetch/node-fetch/issues/1149#issuecomment-840416752
 * @param httpUrl - URL to fetch
 * @returns JSON result string
 */
export async function performSizeAndTimeLimitedMetadataFetch(
  httpUrl: URL
): Promise<string | undefined> {
  const url = httpUrl.toString();
  const ctrl = new AbortController();
  let abortReason: Error | undefined;

  const timer = setTimeout(() => {
    abortReason = new MetadataTimeoutError(url);
    ctrl.abort();
  }, ENV.METADATA_FETCH_TIMEOUT_MS);
  try {
    const networkResult = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (networkResult.status >= 400) {
      throw new HttpError(`Fetch error from ${url} (${networkResult.status})`);
    }
    if (networkResult.body) {
      const decoder = new TextDecoder();
      let responseText: string = '';
      let bytesWritten = 0;
      const reportedContentLength = Number(networkResult.headers.get('content-length') ?? 0);
      if (reportedContentLength > ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE) {
        abortReason = new MetadataSizeExceededError(url);
        ctrl.abort();
      }
      for await (const chunk of networkResult.body) {
        bytesWritten += chunk.byteLength;
        if (bytesWritten > ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE) {
          abortReason = new MetadataSizeExceededError(url);
          ctrl.abort();
        }
        responseText += decoder.decode(chunk as ArrayBuffer, { stream: true });
      }
      responseText += decoder.decode(); // flush the remaining bytes
      clearTimeout(timer);
      return responseText;
    }
  } catch (error) {
    clearTimeout(timer);
    throw abortReason ?? error;
  }
}

export async function getMetadataFromUri(token_uri: string): Promise<RawMetadataType> {
  // Support JSON embedded in a Data URL
  if (new URL(token_uri).protocol === 'data:') {
    const dataUrl = parseDataUrl(token_uri);
    if (!dataUrl) {
      throw new MetadataParseError(`Data URL could not be parsed: ${token_uri}`);
    }
    let content: string;
    // If media type is omitted it should default to percent-encoded `text/plain;charset=US-ASCII`
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs#syntax
    // If media type is specified but without base64 then encoding is ambiguous, so check for
    // percent-encoding or assume a literal string compatible with utf8. Because we're expecting
    // a JSON object we can reliable check for a leading `%` char, otherwise assume unescaped JSON.
    if (dataUrl.base64) {
      content = Buffer.from(dataUrl.data, 'base64').toString('utf8');
    } else if (dataUrl.data.startsWith('%')) {
      content = querystring.unescape(dataUrl.data);
    } else {
      content = dataUrl.data;
    }
    try {
      const result = JSON.parse(content);
      if (RawMetadataCType.Check(result)) {
        return result;
      }
      throw new MetadataParseError(`Invalid raw metadata JSON schema from Data URL`);
    } catch (error) {
      throw new MetadataParseError(`Data URL could not be parsed as JSON: ${token_uri}`);
    }
  }
  const httpUrl = getFetchableUrl(token_uri);

  let fetchImmediateRetryCount = 0;
  let result: JSON | undefined;
  // We'll try to fetch metadata and give it `METADATA_MAX_IMMEDIATE_URI_RETRIES` attempts
  // for the external service to return a reasonable response, otherwise we'll consider the
  // metadata as dead.
  do {
    try {
      const text = await performSizeAndTimeLimitedMetadataFetch(httpUrl);
      result = text ? JSON.parse(text) : undefined;
      break;
    } catch (error) {
      fetchImmediateRetryCount++;
      if (
        error instanceof MetadataSizeExceededError ||
        fetchImmediateRetryCount >= ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES
      ) {
        throw error;
      }
    }
  } while (fetchImmediateRetryCount < ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES);
  if (result) {
    if (RawMetadataCType.Check(result)) {
      return result;
    }
    throw new MetadataParseError(`Invalid raw metadata JSON schema from ${httpUrl.toString()}}`);
  }
  throw new MetadataParseError(`Unable to fetch metadata from ${httpUrl.toString()}`);
}

function getImageUrl(uri: string): string {
  // Support images embedded in a Data URL
  if (new URL(uri).protocol === 'data:') {
    // const dataUrl = ParseDataUrl(uri);
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

/**
 * If an external image processor script is configured, then it will process the given image URL for the purpose
 * of caching on a CDN (or whatever else it may be created to do). The script is expected to return a new URL
 * for the image.
 * If the script is not configured, then the original URL is returned immediately.
 * If a data-uri is passed, it is also immediately returned without being passed to the script.
 */
async function processImageUrl(imgUrl: string): Promise<string> {
  const imageCacheProcessor = ENV.METADATA_IMAGE_CACHE_PROCESSOR;
  if (!imageCacheProcessor) {
    return imgUrl;
  }
  if (imgUrl.startsWith('data:')) {
    return imgUrl;
  }
  const repoDir = path.dirname(__dirname);
  const { code, stdout, stderr } = await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const cp = child_process.spawn(imageCacheProcessor, [imgUrl], { cwd: repoDir });
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', data => (stdout += data));
    cp.stderr.on('data', data => (stderr += data));
    cp.on('close', code => resolve({ code: code ?? 0, stdout, stderr }));
    cp.on('error', error => reject(error));
  });
  if (code !== 0 && stderr) {
    logger.warn(`METADATA_IMAGE_CACHE_PROCESSOR error: ${stderr}`);
  }
  const result = stdout.trim();
  try {
    const url = new URL(result);
    return url.toString();
  } catch (error) {
    throw new Error(
      `Image processing script returned an invalid url for ${imgUrl}: ${result}, stderr: ${stderr}`
    );
  }
}

/**
 * Helper method for creating http/s url for supported protocols.
 * * URLs with `http` or `https` protocols are returned as-is.
 * * URLs with `ipfs` or `ipns` protocols are returned with as an `https` url using a public IPFS
 *   gateway.
 * * URLs with `ar` protocols are returned as `https` using a public Arweave gateway.
 * @param uri - URL to convert
 * @returns Fetchable URL
 */
export function getFetchableUrl(uri: string): URL {
  const parsedUri = new URL(uri);
  if (parsedUri.protocol === 'http:' || parsedUri.protocol === 'https:') return parsedUri;
  if (parsedUri.protocol === 'ipfs:') {
    const host = parsedUri.host === 'ipfs' ? 'ipfs' : `ipfs/${parsedUri.host}`;
    return new URL(`${ENV.PUBLIC_GATEWAY_IPFS}/${host}${parsedUri.pathname}`);
  }
  if (parsedUri.protocol === 'ipns:') {
    return new URL(`${ENV.PUBLIC_GATEWAY_IPFS}/${parsedUri.host}${parsedUri.pathname}`);
  }
  if (parsedUri.protocol === 'ar:') {
    return new URL(`${ENV.PUBLIC_GATEWAY_ARWEAVE}/${parsedUri.host}${parsedUri.pathname}`);
  }
  throw new MetadataParseError(`Unsupported uri protocol: ${uri}`);
}

function parseDataUrl(
  s: string
):
  | { mediaType?: string; contentType?: string; charset?: string; base64: boolean; data: string }
  | false {
  try {
    const url = new URL(s);
    if (url.protocol !== 'data:') {
      return false;
    }
    const validDataUrlRegex =
      /^data:([a-z]+\/[a-z0-9-+.]+(;[a-z0-9-.!#$%*+.{}|~`]+=[a-z0-9-.!#$%*+.{}()|~`]+)*)?(;base64)?,(.*)$/i;
    const parts = validDataUrlRegex.exec(s.trim());
    if (parts === null) {
      return false;
    }
    const parsed: {
      mediaType?: string;
      contentType?: string;
      charset?: string;
      base64: boolean;
      data: string;
    } = {
      base64: false,
      data: '',
    };
    if (parts[1]) {
      parsed.mediaType = parts[1].toLowerCase();
      const mediaTypeParts = parts[1].split(';').map(x => x.toLowerCase());
      parsed.contentType = mediaTypeParts[0];
      mediaTypeParts.slice(1).forEach(attribute => {
        const p = attribute.split('=');
        Object.assign(parsed, { [p[0]]: p[1] });
      });
    }
    parsed.base64 = !!parts[parts.length - 2];
    parsed.data = parts[parts.length - 1] || '';
    return parsed;
  } catch (e) {
    return false;
  }
}

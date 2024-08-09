import * as querystring from 'querystring';
import * as JSON5 from 'json5';
import { Agent, errors, request } from 'undici';
import {
  DbMetadataAttributeInsert,
  DbMetadataInsert,
  DbMetadataLocaleInsertBundle,
  DbMetadataPropertyInsert,
  DbSmartContract,
  DbToken,
} from '../../pg/types';
import { ENV } from '../../env';
import {
  HttpError,
  MetadataParseError,
  MetadataSizeExceededError,
  MetadataTimeoutError,
  TooManyRequestsHttpError,
} from './errors';
import { RetryableJobError } from '../queue/errors';
import { normalizeImageUri, processImageCache } from '../images/image-cache';
import {
  RawMetadataLocale,
  RawMetadataLocalizationCType,
  RawMetadataAttributesCType,
  RawMetadataPropertiesCType,
  RawMetadataCType,
  RawMetadata,
} from './types';

const METADATA_FETCH_HTTP_AGENT = new Agent({
  headersTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
  bodyTimeout: ENV.METADATA_FETCH_TIMEOUT_MS,
  maxResponseSize: ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE,
  maxRedirections: ENV.METADATA_FETCH_MAX_REDIRECTIONS,
  connect: {
    rejectUnauthorized: false, // Ignore SSL cert errors.
  },
});

/**
 * Fetches all the localized metadata JSONs for a token. First, it downloads the default metadata
 * JSON and parses it looking for other localizations. If those are found, each of them is then
 * downloaded, parsed, and returned for DB insertion.
 * @param uri - token metadata URI
 * @param contract - contract DB entry
 * @param token - token DB entry
 * @returns parsed metadata ready for insertion
 */
export async function fetchAllMetadataLocalesFromBaseUri(
  uri: string,
  contract: DbSmartContract,
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

  return parseMetadataForInsertion(rawMetadataLocales, contract, token);
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
  contract: DbSmartContract,
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
      metadata.image_uri ??
      metadata.image_canonical_uri ??
      defaultInsert?.metadata.image ??
      null;
    let cachedImage: string | undefined;
    let cachedThumbnailImage: string | undefined;
    if (image && typeof image === 'string') {
      const normalizedUrl = normalizeImageUri(image);
      [cachedImage, cachedThumbnailImage] = await processImageCache(
        normalizedUrl,
        contract.principal,
        token.token_number
      );
    }
    // Localized values override defaults.
    const metadataInsert: DbMetadataInsert = {
      sip: 16,
      token_id: token.id,
      name: name.toString(),
      description:
        metadata.description?.toString() ?? defaultInsert?.metadata.description?.toString() ?? null,
      image: image ? image.toString() : null,
      cached_image: cachedImage ?? null,
      cached_thumbnail_image: cachedThumbnailImage ?? null,
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
 * Fetches metadata while monitoring timeout and size limits, hostname rate limits, etc. Throws if
 * any is reached.
 * @param httpUrl - URL to fetch
 * @returns Response text
 */
export async function fetchMetadata(httpUrl: URL): Promise<string | undefined> {
  const url = httpUrl.toString();
  try {
    const result = await request(url, {
      method: 'GET',
      throwOnError: true,
      dispatcher:
        // Disable during tests so we can inject a global mock agent.
        process.env.NODE_ENV === 'test' ? undefined : METADATA_FETCH_HTTP_AGENT,
    });
    return await result.body.text();
  } catch (error) {
    if (
      error instanceof errors.HeadersTimeoutError ||
      error instanceof errors.BodyTimeoutError ||
      error instanceof errors.ConnectTimeoutError
    ) {
      throw new MetadataTimeoutError(url);
    } else if (error instanceof errors.ResponseExceededMaxSizeError) {
      throw new MetadataSizeExceededError(url);
    } else if (error instanceof errors.ResponseStatusCodeError && error.statusCode === 429) {
      throw new TooManyRequestsHttpError(httpUrl, error);
    }
    throw new HttpError(`${url}: ${error}`, error);
  }
}

export async function getMetadataFromUri(token_uri: string): Promise<RawMetadata> {
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
    return parseJsonMetadata(token_uri, content);
  }

  // Support HTTP/S URLs otherwise
  const httpUrl = getFetchableDecentralizedStorageUrl(token_uri);
  const urlStr = httpUrl.toString();
  let fetchImmediateRetryCount = 0;
  let content: string | undefined;
  let fetchError: unknown;
  // We'll try to fetch metadata and give it `METADATA_MAX_IMMEDIATE_URI_RETRIES` attempts
  // for the external service to return a reasonable response, otherwise we'll consider the
  // metadata as dead.
  do {
    try {
      content = await fetchMetadata(httpUrl);
      break;
    } catch (error) {
      fetchImmediateRetryCount++;
      fetchError = error;
      if (error instanceof MetadataTimeoutError && isUriFromDecentralizedStorage(token_uri)) {
        // Gateways like IPFS and Arweave commonly time out when a resource can't be found quickly.
        // Try again later if this is the case.
        throw new RetryableJobError(`Gateway timeout for ${urlStr}`, error);
      } else if (error instanceof TooManyRequestsHttpError) {
        // 429 status codes are common when fetching metadata for thousands of tokens in the same
        // server.
        throw new RetryableJobError(`Too many requests for ${urlStr}`, error);
      } else if (
        error instanceof MetadataSizeExceededError ||
        fetchImmediateRetryCount >= ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES
      ) {
        throw error;
      }
    }
  } while (fetchImmediateRetryCount < ENV.METADATA_MAX_IMMEDIATE_URI_RETRIES);
  return parseJsonMetadata(urlStr, content);
}

function parseJsonMetadata(url: string, content?: string): RawMetadata {
  if (!content) {
    throw new MetadataParseError(`Fetched metadata is blank: ${url}`);
  }
  try {
    const result = JSON5.parse(content);
    if (RawMetadataCType.Check(result)) {
      return result;
    } else {
      throw new MetadataParseError(`Invalid raw metadata JSON schema: ${url}`);
    }
  } catch (error) {
    throw new MetadataParseError(`JSON parse error: ${url}`);
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
export function getFetchableDecentralizedStorageUrl(uri: string): URL {
  try {
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
  } catch (error) {
    throw new MetadataParseError(`Invalid uri: ${uri}`);
  }
  throw new MetadataParseError(`Unsupported uri protocol: ${uri}`);
}

function isUriFromDecentralizedStorage(uri: string): boolean {
  return (
    uri.startsWith('ipfs:') ||
    uri.startsWith('ipns:') ||
    uri.startsWith('ar:') ||
    uri.startsWith('https://cloudflare-ipfs.com')
  );
}

export function parseDataUrl(
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

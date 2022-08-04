import * as querystring from 'querystring';
import { Transform, TransformCallback } from 'stream';
import { Agent, fetch, getGlobalDispatcher, Response } from 'undici';
import {
  DbMetadataAttributeInsert,
  DbMetadataInsert,
  DbMetadataLocaleInsertBundle,
  DbMetadataPropertyInsert,
  DbToken
} from '../../pg/types';
import { ENV } from '../../env';
import { TextDecoder } from 'util';
import { MetadataSizeExceededError, MetadataTimeoutError } from './errors';
import { stopwatch } from './helpers';

type RawMetadataLocale = {
  metadata: any,
  locale?: string,
  default: boolean,
  uri: string,
}

/**
 * Fetches all the localized metadata JSONs for a token. First, it downloads the default metadata
 * and parses it looking for other localizations. If those are found, each of them is then
 * downloaded, parsed, and returned for DB insertion.
 * @param uri token metadata URI
 * @param token token DB entry
 * @returns parsed metadata ready for insertion
 */
export async function fetchAllMetadataLocalesFromBaseUri(
  uri: string, token: DbToken
): Promise<DbMetadataLocaleInsertBundle[]> {
  const tokenUri = getTokenSpecificUri(uri, token.token_number);
  let rawMetadataLocales: RawMetadataLocale[] = [];
  const defaultMetadata = await getMetadataFromUri(tokenUri);

  rawMetadataLocales.push({
    metadata: defaultMetadata,
    default: true,
    uri: tokenUri,
  });
  if (defaultMetadata.localization) {
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

export function getTokenSpecificUri(
  uri: string,
  tokenNumber: number,
  locale?: string
): string {
  return uri.replace('{id}', tokenNumber.toString()).replace('{locale}', locale ?? '');
}

function parseMetadataForInsertion(
  rawMetadataLocales: RawMetadataLocale[],
  token: DbToken
): DbMetadataLocaleInsertBundle[] {
  // Keep the default because we may need to fall back into its data.
  let defaultInsert: DbMetadataLocaleInsertBundle | undefined;
  let inserts: DbMetadataLocaleInsertBundle[] = [];
  for (const raw of rawMetadataLocales) {
    const metadata = raw.metadata;
    const sip = metadata.sip ?? 16;
    const name = metadata.name ?? defaultInsert?.metadata.name;
    if (!name) {
      // SIP-016 requires at least `sip` and `name` to be defined.
      continue;
    }
    // Localized values override defaults.
    const metadataInsert: DbMetadataInsert = {
      sip: sip,
      token_id: token.id,
      name: name,
      description: metadata.description ?? defaultInsert?.metadata.description ?? null,
      image: metadata.image ?? defaultInsert?.metadata.image ?? null, // TODO: CDN
      l10n_default: raw.default,
      l10n_locale: raw.locale ?? null,
      l10n_uri: raw.uri,
    };
    // Localized attributes rewrite all default attributes. No fall back.
    const attributes: DbMetadataAttributeInsert[] = [];
    if (metadata.attributes) {
      for (const { trait_type, value, display_type } of metadata.attributes) {
        if (trait_type && value) {
          attributes.push({
            trait_type: trait_type,
            value: JSON.stringify(value),
            display_type: display_type ?? null,
          });
        }
      }
    }
    // Localized properties only override their default. All others have to fall back to default
    // values.
    const properties: DbMetadataPropertyInsert[] = defaultInsert?.properties ?? [];
    if (metadata.properties) {
      for (const [key, value] of Object.entries(metadata.properties)) {
        if (key && value) {
          const defaultProp = properties.find(p => p.name === key);
          if (defaultProp) {
            defaultProp.value = JSON.stringify(value)
          } else {
            properties.push({
              name: key,
              value: JSON.stringify(value)
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
 * @param httpUrl URL to fetch
 * @returns JSON content
 */
export async function performSizeAndTimeLimitedMetadataFetch(
  httpUrl: URL
): Promise<string | undefined> {
  const ctrl = new AbortController();
  let abortReason: Error | undefined;

  const timer = setTimeout(() => {
    abortReason = new MetadataTimeoutError();
    ctrl.abort();
  }, ENV.METADATA_FETCH_TIMEOUT_MS);
  try {
    const networkResult = await fetch(httpUrl.toString(), {
      method: 'GET',
      signal: ctrl.signal
    });
    if (networkResult.body) {
      const decoder = new TextDecoder();
      let responseText: string = '';
      let bytesWritten = 0;
      const reportedContentLength = Number(networkResult.headers.get('content-length') ?? 0)
      if (reportedContentLength > ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE) {
        abortReason = new MetadataSizeExceededError();
        ctrl.abort();
      }
      for await (const chunk of networkResult.body) {
        bytesWritten += chunk.byteLength
        if (bytesWritten > ENV.METADATA_MAX_PAYLOAD_BYTE_SIZE) {
          abortReason = new MetadataSizeExceededError();
          ctrl.abort();
        }
        responseText += decoder.decode(chunk, { stream: true })
      }
      responseText += decoder.decode() // flush the remaining bytes
      clearTimeout(timer);
      return responseText;
    }
  } catch (error) {
    clearTimeout(timer);
    throw abortReason ?? error;
  }
}

async function getMetadataFromUri(token_uri: string): Promise<any> {
  // Support JSON embedded in a Data URL
  if (new URL(token_uri).protocol === 'data:') {
    const dataUrl = parseDataUrl(token_uri);
    if (!dataUrl) {
      throw new Error(`Data URL could not be parsed: ${token_uri}`);
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
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Data URL could not be parsed as JSON: ${token_uri}`);
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
    return result;
  }
  throw new Error(`Unable to fetch metadata from ${httpUrl.toString()}`);
}

function getImageUrl(uri: string): string {
  // Support images embedded in a Data URL
  if (new URL(uri).protocol === 'data:') {
    // const dataUrl = ParseDataUrl(uri);
    const dataUrl = parseDataUrl(uri);
    if (!dataUrl) {
      throw new Error(`Data URL could not be parsed: ${uri}`);
    }
    if (!dataUrl.mediaType?.startsWith('image/')) {
      throw new Error(`Token image is a Data URL with a non-image media type: ${uri}`);
    }
    return uri;
  }
  const fetchableUrl = getFetchableUrl(uri);
  return fetchableUrl.toString();
}

const PUBLIC_IPFS = 'https://ipfs.io';

/**
 * Helper method for creating http/s url for supported protocols.
 * URLs with `http` or `https` protocols are returned as-is.
 * URLs with `ipfs` or `ipns` protocols are returned with as an `https` url
 * using a public IPFS gateway.
 */
function getFetchableUrl(uri: string): URL {
  const parsedUri = new URL(uri);
  if (parsedUri.protocol === 'http:' || parsedUri.protocol === 'https:') return parsedUri;
  if (parsedUri.protocol === 'ipfs:')
    return new URL(`${PUBLIC_IPFS}/${parsedUri.host}${parsedUri.pathname}`);

  if (parsedUri.protocol === 'ipns:')
    return new URL(`${PUBLIC_IPFS}/${parsedUri.host}${parsedUri.pathname}`);

  throw new Error(`Unsupported uri protocol: ${uri}`);
}

function parseDataUrl(s: string):
  | { mediaType?: string; contentType?: string; charset?: string; base64: boolean; data: string }
  | false {
  try {
    const url = new URL(s);
    if (url.protocol !== 'data:') {
      return false;
    }
    const validDataUrlRegex = /^data:([a-z]+\/[a-z0-9-+.]+(;[a-z0-9-.!#$%*+.{}|~`]+=[a-z0-9-.!#$%*+.{}()|~`]+)*)?(;base64)?,(.*)$/i;
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

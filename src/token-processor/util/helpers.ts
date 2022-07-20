import { ENV } from '../..';
import { DbSipNumber, DbTokenType } from '../../pg/types';
import { TokenMetadataProcessingMode } from '../process-token-job';
import * as querystring from 'querystring';
import { request } from 'undici';

/**
 * Determines the token metadata processing mode based on .env values.
 * @returns TokenMetadataProcessingMode
 */
export function getTokenMetadataProcessingMode(): TokenMetadataProcessingMode {
  if (ENV.METADATA_STRICT_MODE) {
    return TokenMetadataProcessingMode.strict;
  }
  return TokenMetadataProcessingMode.default;
}

export interface Stopwatch {
  /** Milliseconds since stopwatch was created. */
  getElapsed: () => number;
  /** Seconds since stopwatch was created. */
  getElapsedSeconds: () => number;
  getElapsedAndRestart: () => number;
  restart(): void;
}

export function stopwatch(): Stopwatch {
  let start = process.hrtime.bigint();
  const result: Stopwatch = {
    getElapsedSeconds: () => {
      const elapsedMs = result.getElapsed();
      return elapsedMs / 1000;
    },
    getElapsed: () => {
      const end = process.hrtime.bigint();
      return Number((end - start) / 1_000_000n);
    },
    getElapsedAndRestart: () => {
      const end = process.hrtime.bigint();
      const result = Number((end - start) / 1_000_000n);
      start = process.hrtime.bigint();
      return result;
    },
    restart: () => {
      start = process.hrtime.bigint();
    },
  };
  return result;
}

const PUBLIC_IPFS = 'https://ipfs.io';

/**
 * Helper method for creating http/s url for supported protocols.
 * URLs with `http` or `https` protocols are returned as-is.
 * URLs with `ipfs` or `ipns` protocols are returned with as an `https` url
 * using a public IPFS gateway.
 */
export function getFetchableUrl(uri: string): URL {
  const parsedUri = new URL(uri);
  if (parsedUri.protocol === 'http:' || parsedUri.protocol === 'https:') return parsedUri;
  if (parsedUri.protocol === 'ipfs:')
    return new URL(`${PUBLIC_IPFS}/${parsedUri.host}${parsedUri.pathname}`);

  if (parsedUri.protocol === 'ipns:')
    return new URL(`${PUBLIC_IPFS}/${parsedUri.host}${parsedUri.pathname}`);

  throw new Error(`Unsupported uri protocol: ${uri}`);
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

export async function getMetadataFromUri(token_uri: string): Promise<any> {
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
      const networkResult = await request(httpUrl.toString(), {
        method: 'GET',
        bodyTimeout: ENV.METADATA_FETCH_TIMEOUT_MS
      });
      result = await networkResult.body.json();
      // FIXME: this
      // result = await performFetch(httpUrl.toString(), {
      //   timeoutMs: getTokenMetadataFetchTimeoutMs(),
      //   maxResponseBytes: METADATA_MAX_PAYLOAD_BYTE_SIZE,
      // });
      break;
    } catch (error) {
      fetchImmediateRetryCount++;
      if (
        // (error instanceof FetchError && error.type === 'max-size') ||
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

export function dbSipNumberToDbTokenType(sip: DbSipNumber): DbTokenType {
  switch (sip) {
    case DbSipNumber.sip009:
      return DbTokenType.nft;
    case DbSipNumber.sip010:
      return DbTokenType.ft;
    case DbSipNumber.sip013:
      return DbTokenType.sft;
  }
}

// export async function performFetch<Type>(
//   url: string,
//   opts?: {
//     timeoutMs?: number;
//     maxResponseBytes?: number;
//   }
// ): Promise<Type> {
//   const result = await fetch(url, {
//     size: opts?.maxResponseBytes ?? METADATA_MAX_PAYLOAD_BYTE_SIZE,
//     timeout: opts?.timeoutMs ?? getTokenMetadataFetchTimeoutMs(),
//   });
//   if (!result.ok) {
//     let msg = '';
//     try {
//       msg = await result.text();
//     } catch (error) {
//       // ignore errors from fetching error text
//     }
//     throw new Error(`Response ${result.status}: ${result.statusText} fetching ${url} - ${msg}`);
//   }
//   const resultString = await result.text();
//   try {
//     return JSON.parse(resultString) as Type;
//   } catch (error) {
//     throw new Error(`Error parsing response from ${url} as JSON: ${error}`);
//   }
// }

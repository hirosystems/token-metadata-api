import { ENV } from '../..';
import { DbSipNumber, DbTokenType } from '../../pg/types';
import { TokenMetadataProcessingMode } from '../process-token-job';

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

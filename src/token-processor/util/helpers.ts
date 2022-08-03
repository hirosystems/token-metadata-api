import { DbSipNumber, DbTokenType } from '../../pg/types';
import { TokenMetadataProcessingMode } from '../queue/job-queue';
import { ENV } from '../../env';

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

import { errors } from 'undici';
import { DbSipNumber, DbTokenType } from '../../pg/types';

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

export type Waiter<T> = Promise<T> & {
  finish: (result: T) => void;
  isFinished: boolean;
};

export function waiter<T = void>(): Waiter<T> {
  let resolveFn: (result: T) => void;
  const promise = new Promise<T>(resolve => {
    resolveFn = resolve;
  });
  const completer = {
    finish: (result: T) => {
      completer.isFinished = true;
      resolveFn(result);
    },
    isFinished: false,
  };
  return Object.assign(promise, completer);
}

/**
 * Parses a `Retry-After` HTTP header from an undici 429 `ResponseStatusCodeError` error so we can
 * determine when we can try calling the same host again looking for metadata.
 * @param error - Original ResponseStatusCodeError
 * @returns retry-after value in seconds since now
 */
export function parseRetryAfterResponseHeader(
  error: errors.ResponseStatusCodeError
): number | undefined {
  if (error.statusCode != 429 || !error.headers || !('retry-after' in error.headers)) {
    return;
  }
  const header = error.headers['retry-after'];
  if (!header) return;
  const wrappedValue = Array.isArray(header) ? header : [header];

  // Return the first valid header value we find.
  for (const value of wrappedValue) {
    // Numerical values e.g. `Retry-After: 120`
    const nval = Number(value);
    if (Number.isFinite(nval) && nval > 0) {
      return nval;
    }
    // HTTP Date values e.g. `Retry-After: Wed, 21 Oct 2015 07:28:00 GMT`
    const retryDateMS = Date.parse(value);
    if (Number.isNaN(retryDateMS)) return;
    const deltaMS = retryDateMS - Date.now();
    return deltaMS > 0 ? Math.ceil(deltaMS / 1000) : undefined;
  }
}

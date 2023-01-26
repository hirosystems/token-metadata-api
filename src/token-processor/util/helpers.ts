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

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

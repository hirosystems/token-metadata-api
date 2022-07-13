import { Static, Type } from '@sinclair/typebox';

export type FoundOrNot<T> = { found: true; result: T } | { found: false; result?: T };

export enum DbSipNumber {
  /** Non-Fungible Tokens */
  sip009 = 'sip-009',
  /** Fungible Tokens */
  sip010 = 'sip-010',
  /** Semi-Fungible Tokens */
  sip013 = 'sip-013'
}

export enum DbQueueEntryStatus {
  new = 'new',
  processing = 'processing',
  retry = 'retry',
  ready = 'ready'
}

export type DbSmartContractInsert = {
  name: string;
  sip: DbSipNumber;
  abi: string;
  tx_id: string;
  block_height: number;
}

export type DbSmartContract = DbSmartContractInsert & {
  id: number;
  token_count?: number;
  created_at: string;
  updated_at?: string;
}

export type DbSmartContractQueueEntry = {
  id: number;
  smart_contract_id: number;
  status: DbQueueEntryStatus;
  retry_count: number;
  created_at: string;
  updated_at?: string;
}

export const DbFtInsert = Type.Object({
  smart_contract_id: Type.Integer(),
});

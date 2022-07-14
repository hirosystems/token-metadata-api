import { Static, Type } from '@sinclair/typebox';

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

export enum DbTokenType {
  ft = 'ft',
  nft = 'nft',
  sft = 'sft'
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

export type DbSmartContractQueueEntryInsert = {
  smart_contract_id: number;
}

export type DbSmartContractQueueEntry = DbSmartContractQueueEntryInsert & {
  id: number;
  status: DbQueueEntryStatus;
  retry_count: number;
  created_at: string;
  updated_at?: string;
}

export type DbTokenInsert = {
  smart_contract_id: number;
  type: DbTokenType,
  token_number: number;
}

export type DbToken = DbTokenInsert & {
  id: number;
  uri?: string;
  name?: string;
  decimals?: number;
  total_supply?: number;
}

export type DbTokenQueueEntryInsert = {
  token_id: number;
}

export type DbTokenQueueEntry = DbTokenQueueEntryInsert & {
  id: number;
  status: DbQueueEntryStatus;
  retry_count: number;
  created_at: string;
  updated_at?: string;
}

export const DbFtInsert = Type.Object({
  smart_contract_id: Type.Integer(),
});

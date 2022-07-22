export enum DbSipNumber {
  /** Non-Fungible Tokens */
  sip009 = 'sip-009',
  /** Fungible Tokens */
  sip010 = 'sip-010',
  /** Semi-Fungible Tokens */
  sip013 = 'sip-013'
}

export enum DbJobStatus {
  waiting = 'waiting',
  queued = 'queued',
  done = 'done',
  failed = 'failed'
}

export enum DbTokenType {
  ft = 'ft',
  nft = 'nft',
  sft = 'sft'
}

export type DbSmartContractInsert = {
  principal: string;
  sip: DbSipNumber;
  abi: string;
  tx_id: string;
  block_height: number;
}

export type DbSmartContract = {
  id: number;
  principal: string;
  sip: DbSipNumber;
  abi: string;
  tx_id: string;
  block_height: number;
  token_count?: number;
  created_at: string;
  updated_at?: string;
}

export type DbTokenInsert = {
  smart_contract_id: number;
  type: DbTokenType,
  token_number: number;
}

export type DbToken = {
  id: number;
  smart_contract_id: number;
  type: DbTokenType,
  token_number: number;
  uri?: string;
  name?: string;
  decimals?: number;
  total_supply?: number;
  symbol?: string;
}

export type DbJobInsert = {
  token_id?: number;
  smart_contract_id?: number;
}

export type DbJob = {
  id: number;
  token_id?: number;
  smart_contract_id?: number;
  status: DbJobStatus;
  retry_count: number;
  created_at: string;
  updated_at?: string;
}

export type DbFtInsert = {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  total_supply: number | null;
  uri: string | null;
}

export type DbNftInsert = {
  uri: string | null;
}

export type DbSftInsert = {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  total_supply: number | null;
  uri: string | null;
}

export type DbMetadataInsert = {
  sip: number;
  token_id: number;
  l10n_locale: string | null;
  l10n_uri: string | null;
  l10n_default: boolean | null;
  name: string | null;
  description: string | null;
  image: string | null;
}

export type DbMetadata = {
  id: number;
  sip: number;
  token_id: number;
  l10n_locale?: string;
  l10n_uri?: string;
  l10n_default?: boolean;
  name?: string;
  description?: string;
  image?: string;
}

export type DbMetadataAttributeInsert = {
  // We don't require `metadata_id` because that is determined by the insertion query.
  trait_type: string;
  value: string;
  display_type: string | null;
}

export type DbMetadataAttribute = {
  id: number;
  metadata_id: number;
  trait_type: string;
  value: string;
  display_type?: string;
}

export type DbMetadataPropertyInsert = {
  // We don't require `metadata_id` because that is determined by the insertion query.
  name: string;
  value: string;
}

export type DbMetadataProperty = {
  id: number;
  metadata_id: number;
  name: string;
  value: string;
}

export type DbMetadataLocaleInsertBundle = {
  metadata: DbMetadataInsert;
  attributes?: DbMetadataAttributeInsert[];
  properties?: DbMetadataPropertyInsert[];
}

export type DbProcessedTokenUpdateBundle = {
  token: DbFtInsert | DbNftInsert | DbSftInsert,
  metadataLocales?: DbMetadataLocaleInsertBundle[]
}

export type DbMetadataLocaleBundle = {
  metadata: DbMetadata;
  attributes: DbMetadataAttribute[];
  properties: DbMetadataProperty[];
}

export type DbTokenMetadataLocaleBundle = {
  token: DbToken,
  metadataLocale?: DbMetadataLocaleBundle
}

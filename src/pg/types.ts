import { PgJsonb, PgNumeric } from '@hirosystems/api-toolkit';
import { FtOrderBy, Order } from '../api/schemas';

export enum DbSipNumber {
  /** Non-Fungible Tokens */
  sip009 = 'sip-009',
  /** Fungible Tokens */
  sip010 = 'sip-010',
  /** Semi-Fungible Tokens */
  sip013 = 'sip-013',
}

export enum DbJobStatus {
  pending = 'pending',
  queued = 'queued',
  done = 'done',
  failed = 'failed',
  invalid = 'invalid',
}

export enum DbTokenType {
  ft = 'ft',
  nft = 'nft',
  sft = 'sft',
}

export enum DbTokenUpdateMode {
  standard = 'standard',
  frozen = 'frozen',
  dynamic = 'dynamic',
}

export type DbSmartContractInsert = {
  principal: string;
  sip: DbSipNumber;
  abi: PgJsonb;
  tx_id: string;
  block_height: number;
};

export type DbSmartContract = {
  id: number;
  principal: string;
  sip: DbSipNumber;
  tx_id: string;
  block_height: number;
  token_count?: bigint;
  created_at: string;
  updated_at?: string;
};

export type DbTokenInsert = {
  smart_contract_id: number;
  type: DbTokenType;
  token_number: PgNumeric;
};

export type DbToken = {
  id: number;
  smart_contract_id: number;
  type: DbTokenType;
  token_number: bigint;
  update_mode: DbTokenUpdateMode;
  ttl?: number;
  uri?: string;
  name?: string;
  decimals?: number;
  total_supply?: bigint;
  symbol?: string;
  created_at: string;
  updated_at?: string;
};

export type DbJobInsert = {
  token_id?: number;
  smart_contract_id?: number;
};

export type DbJob = {
  id: number;
  token_id?: number;
  smart_contract_id?: number;
  status: DbJobStatus;
  retry_count: number;
  created_at: string;
  updated_at?: string;
};

export type DbTokenMetadataNotificationInsert = {
  smart_contract_id: number;
  block_height: number;
  index_block_hash: string;
  tx_id: string;
  tx_index: number;
  event_index: number;
  token_numbers: string | null;
  update_mode: DbTokenUpdateMode;
  ttl: PgNumeric | null;
};

export type DbRateLimitedHostInsert = {
  hostname: string;
  // Will be converted into a timestamp upon insert.
  retry_after: number;
};

export type DbRateLimitedHost = {
  id: number;
  hostname: string;
  created_at: string;
  retry_after: string;
};

export type DbFtInsert = {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  total_supply: PgNumeric | null;
  uri: string | null;
};

export type DbNftInsert = {
  uri: string | null;
};

export type DbSftInsert = {
  decimals: number | null;
  total_supply: PgNumeric | null;
  uri: string | null;
};

export type DbMetadataInsert = {
  sip: number;
  token_id: number;
  name: string;
  l10n_locale: string | null;
  l10n_uri: string | null;
  l10n_default: boolean | null;
  description: string | null;
  image: string | null;
  cached_image: string | null;
};

export type DbMetadata = {
  id: number;
  sip: number;
  token_id: number;
  name: string;
  l10n_locale?: string;
  l10n_uri?: string;
  l10n_default?: boolean;
  description?: string;
  image?: string;
  cached_image?: string;
};

export type DbMetadataAttributeInsert = {
  // We don't require `metadata_id` because that is determined by the insertion query.
  trait_type: string;
  value: PgJsonb;
  display_type: string | null;
};

export type DbMetadataAttribute = {
  id: number;
  metadata_id: number;
  trait_type: string;
  value: string;
  display_type?: string;
};

export type DbMetadataPropertyInsert = {
  // We don't require `metadata_id` because that is determined by the insertion query.
  name: string;
  value: PgJsonb;
};

export type DbMetadataProperty = {
  id: number;
  metadata_id: number;
  name: string;
  value: string;
};

export type DbMetadataLocaleInsertBundle = {
  metadata: DbMetadataInsert;
  attributes?: DbMetadataAttributeInsert[];
  properties?: DbMetadataPropertyInsert[];
};

export type DbProcessedTokenUpdateBundle = {
  token: DbFtInsert | DbNftInsert | DbSftInsert;
  metadataLocales?: DbMetadataLocaleInsertBundle[];
};

export type DbMetadataLocaleBundle = {
  metadata: DbMetadata;
  attributes: DbMetadataAttribute[];
  properties: DbMetadataProperty[];
};

export type DbTokenMetadataLocaleBundle = {
  token: DbToken;
  smartContract: DbSmartContract;
  metadataLocale?: DbMetadataLocaleBundle;
};

export type DbIndexPaging = {
  limit: number;
  offset: number;
};

export type DbFungibleTokenFilters = {
  name?: string;
  symbol?: string;
  address?: string;
};

export type DbFungibleTokenOrder = {
  order_by?: FtOrderBy;
  order?: Order;
};

export type DbPaginatedResult<T> = {
  total: number;
  results: T[];
};

export type DbFungibleTokenMetadataItem = {
  name?: string;
  symbol?: string;
  decimals?: number;
  total_supply?: bigint;
  uri?: string;
  description?: string;
  tx_id: string;
  principal: string;
  image?: string;
  cached_image?: string;
};

export const SMART_CONTRACTS_COLUMNS = [
  'id',
  'principal',
  'sip',
  'tx_id',
  'block_height',
  'token_count',
  'created_at',
  'updated_at',
];

export const TOKENS_COLUMNS = [
  'id',
  'smart_contract_id',
  'type',
  'token_number',
  'update_mode',
  'ttl',
  'uri',
  'name',
  'decimals',
  'total_supply',
  'symbol',
  'created_at',
  'updated_at',
];

export const JOBS_COLUMNS = [
  'id',
  'token_id',
  'smart_contract_id',
  'status',
  'retry_count',
  'created_at',
  'updated_at',
];

export const METADATA_COLUMNS = [
  'id',
  'sip',
  'token_id',
  'name',
  'l10n_locale',
  'l10n_uri',
  'l10n_default',
  'description',
  'image',
  'cached_image',
];

export const METADATA_ATTRIBUTES_COLUMNS = [
  'id',
  'metadata_id',
  'trait_type',
  'value',
  'display_type',
];

export const METADATA_PROPERTIES_COLUMNS = ['id', 'metadata_id', 'name', 'value'];

export const RATE_LIMITED_HOSTS_COLUMNS = ['id', 'hostname', 'created_at', 'retry_after'];

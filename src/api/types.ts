import { Static, Type } from '@sinclair/typebox';

export const SmartContractID = Type.String({ $id: 'smart-contract-id' });
export type SmartContractIDType = Static<typeof SmartContractID>;

/**
 * SIP-016 Token Metadata
 */
export const MetadataValue = Type.Union([
  Type.Object({}),
  Type.String(),
  Type.Number(),
  Type.Integer(),
  Type.Boolean(),
  Type.Array(Type.Any()),
], { $id: 'metadata-value' });
export type MetadataValueType = Static<typeof MetadataValue>;

export const MetadataAttribute = Type.Object({
  trait_type: Type.String(),
  value: Type.Ref(MetadataValue),
  display_type: Type.Optional(Type.String())
}, { $id: 'metadata-attribute' });
export type MetadataAttributeType = Static<typeof MetadataAttribute>;

export const MetadataProperty = Type.Object({
  type: Type.Optional(Type.String()),
  value: Type.Optional(Type.Ref(MetadataValue)),
  description: Type.Optional(Type.String())
}, { $id: 'metadata-property' });
export type MetadataPropertyType = Static<typeof MetadataProperty>;

export const MetadataLocalization = Type.Object({
  uri: Type.String({ format: 'uri' }),
  default: Type.String(),
  locales: Type.Array(Type.String()),
}, { $id: 'metadata-localization' });
export type MetadataLocalizationType = Static<typeof MetadataLocalization>;

export const Metadata = Type.Object({
  sip: Type.Integer(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String({ format: 'uri' })),
  attributes: Type.Optional(Type.Array(Type.Ref(MetadataAttribute))),
  properties: Type.Optional(Type.Array(Type.Ref(MetadataProperty))),
  localization: Type.Optional(Type.Ref(MetadataLocalization)),
}, { $id: 'metadata' });
export type MetadataType = Static<typeof Metadata>;

/**
 * SIP-010 Fungible Token
 */
export const FungibleTokenResponse = Type.Object({
  name: Type.String(),
  symbol: Type.String(),
  decimals: Type.Integer(),
  total_supply: Type.Integer(),
  token_uri: Type.String({ format: 'uri' }),
  metadata: Type.Ref(Metadata),
});
export type FungibleTokenResponseType = Static<typeof FungibleTokenResponse>;

export const FungibleTokenParams = Type.Object({
  contract_id: Type.String(),
});
export type FungibleTokenParamsType = Static<typeof FungibleTokenParams>;

/**
 * SIP-009 Non-Fungible Token
 */
export const NonFungibleTokenResponse = Type.Object({
  token_uri: Type.String({ format: 'uri' }),
  metadata: Type.Ref(Metadata),
});
export type NonFungibleTokenResponseType = Static<typeof NonFungibleTokenResponse>;

export const NonFungibleTokenParams = Type.Object({
  contract_id: Type.Ref(SmartContractID),
  token_id: Type.Integer(),
});
export type NonFungibleTokenParamsType = Static<typeof NonFungibleTokenParams>;

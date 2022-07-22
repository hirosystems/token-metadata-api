import { Static, Type } from '@sinclair/typebox';

export const SmartContractPrincipal = Type.RegEx(
  /[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}\.[a-zA-Z]([a-zA-Z0-9]|[-_]){0,39}/
);
export type SmartContractPrincipalType = Static<typeof SmartContractPrincipal>;

/**
 * SIP-016 Token Metadata
 */
export const MetadataAttribute = Type.Object({
  trait_type: Type.String(),
  value: Type.Any(),
  display_type: Type.Optional(Type.String())
});
export type MetadataAttributeType = Static<typeof MetadataAttribute>;

export const MetadataProperties = Type.Record(Type.String(), Type.Any());
export type MetadataPropertiesType = Static<typeof MetadataProperties>;

export const MetadataLocalization = Type.Object({
  uri: Type.String({ format: 'uri' }),
  default: Type.String(),
  locales: Type.Array(Type.String()),
});
export type MetadataLocalizationType = Static<typeof MetadataLocalization>;

export const Metadata = Type.Object({
  sip: Type.Integer(),
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String({ format: 'uri' })),
  attributes: Type.Optional(Type.Array(MetadataAttribute)),
  properties: Type.Optional(MetadataProperties),
  localization: Type.Optional(MetadataLocalization),
});
export type MetadataType = Static<typeof Metadata>;

/**
 * SIP-010 Fungible Token
 */
export const FungibleTokenResponse = Type.Object({
  name: Type.Optional(Type.String()),
  symbol: Type.Optional(Type.String()),
  decimals: Type.Optional(Type.Integer()),
  total_supply: Type.Optional(Type.Integer()),
  token_uri: Type.Optional(Type.String({ format: 'uri' })),
  metadata: Type.Optional(Metadata),
});
export type FungibleTokenResponseType = Static<typeof FungibleTokenResponse>;

export const FungibleTokenParams = Type.Object({
  principal: SmartContractPrincipal,
});
export type FungibleTokenParamsType = Static<typeof FungibleTokenParams>;

/**
 * SIP-009 Non-Fungible Token
 */
export const NonFungibleTokenResponse = Type.Object({
  token_uri: Type.Optional(Type.String({ format: 'uri' })),
  metadata: Type.Optional(Metadata),
});
export type NonFungibleTokenResponseType = Static<typeof NonFungibleTokenResponse>;

export const NonFungibleTokenParams = Type.Object({
  principal: SmartContractPrincipal,
  token_id: Type.Integer(),
});
export type NonFungibleTokenParamsType = Static<typeof NonFungibleTokenParams>;

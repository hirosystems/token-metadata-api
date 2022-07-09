import { Static, Type } from '@sinclair/typebox';

/**
 * SIP-016 Token Metadata
 */
export const TokenMetadata = Type.Object({
  sip: Type.Integer(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String({ format: 'uri' })),
  attributes: Type.Optional(Type.Array(
    Type.Object({
      trait_type: Type.String(),
      value: Type.Union([
        Type.Object({}),
        Type.String(),
        Type.Number(),
        Type.Integer(),
        Type.Boolean(),
        Type.Array(Type.Any()),
      ]),
      display_type: Type.Optional(Type.String())
    })
  )),
  properties: Type.Optional(Type.Object({})),
  localization: Type.Optional(Type.Object({
    uri: Type.String({ format: 'uri' }),
    default: Type.String(),
    locales: Type.Array(Type.String()),
  })),
}, { $id: 'token-metadata' });
export type TokenMetadataType = Static<typeof TokenMetadata>;

/**
 * SIP-010 Fungible Token
 */
export const FungibleToken = Type.Object({
  name: Type.String(),
  symbol: Type.String(),
  decimals: Type.Integer(),
  total_supply: Type.Integer(),
  token_uri: Type.String({ format: 'uri' }),
  metadata: Type.Ref(TokenMetadata),
});
export type FungibleTokenType = Static<typeof FungibleToken>;

export const FungibleTokenParams = Type.Object({
  contract_id: Type.String(),
});
export type FungibleTokenParamsType = Static<typeof FungibleTokenParams>;

/**
 * SIP-009 Non-Fungible Token
 */
export const NonFungibleToken = Type.Object({
  token_uri: Type.String({ format: 'uri' }),
  metadata: Type.Ref(TokenMetadata),
});
export type NonFungibleTokenType = Static<typeof NonFungibleToken>;

export const NonFungibleTokenParams = Type.Object({
  contract_id: Type.String(),
  token_id: Type.Integer(),
});
export type NonFungibleTokenParamsType = Static<typeof NonFungibleTokenParams>;

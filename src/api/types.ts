import { Static, Type } from '@sinclair/typebox';

/** SIP-016 Token Metadata */
export const TokenMetadata = Type.Object({
  sip: Type.Integer(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String({ format: 'uri' })),
  // attributes
  properties: Type.Optional(Type.Object({})),
  localization: Type.Optional(Type.Object({
    uri: Type.String({ format: 'uri' }),
    default: Type.String(),
    // locales
  }))
});

export const FungibleToken = Type.Object({
  name: Type.String(),
  symbol: Type.String(),
  decimals: Type.Integer(),
  total_supply: Type.Integer(),
  token_uri: Type.String({ format: 'uri' }),
})

export type FungibleTokenSchema = Static<typeof FungibleToken>

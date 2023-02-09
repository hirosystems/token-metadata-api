import { Static, Type } from '@sinclair/typebox';

export const SmartContractRegEx =
  /[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}\.[a-zA-Z]([a-zA-Z0-9]|[-_]){0,39}/;

export const TokenQuerystringParams = Type.Object({
  locale: Type.Optional(
    Type.String({ description: 'Metadata localization to retrieve', examples: ['es-MX', 'jp'] })
  ),
});

const MetadataValue = Type.Union([
  Type.Object({}, { additionalProperties: true }),
  Type.String(),
  Type.Number(),
  Type.Integer(),
  Type.Boolean(),
  Type.Array(Type.Any()),
]);
export type MetadataValueType = Static<typeof MetadataValue>;

export const MetadataAttribute = Type.Object({
  trait_type: Type.String(),
  display_type: Type.Optional(Type.String()),
  value: MetadataValue,
});

export const MetadataProperties = Type.Record(Type.String(), MetadataValue);
export type MetadataPropertiesType = Static<typeof MetadataProperties>;

export const MetadataLocalization = Type.Object({
  uri: Type.String({ format: 'uri' }),
  default: Type.String(),
  locales: Type.Array(Type.String()),
});

export const Metadata = Type.Object({
  sip: Type.Integer(),
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  image: Type.Optional(Type.String({ format: 'uri' })),
  cached_image: Type.Optional(Type.String({ format: 'uri' })),
  attributes: Type.Optional(Type.Array(MetadataAttribute)),
  properties: Type.Optional(MetadataProperties),
  localization: Type.Optional(MetadataLocalization),
});
export type MetadataType = Static<typeof Metadata>;

export const Name = Type.String();
export const Symbol = Type.String();
export const Decimals = Type.Integer();
export const TotalSupply = Type.String();
export const TokenUri = Type.String({ format: 'uri' });

export const TokenNotFoundResponse = Type.Object({
  error: Type.Literal('Token not found'),
});
export const TokenNotProcessedResponse = Type.Object({
  error: Type.Literal('Token metadata fetch in progress'),
});
export const TokenLocaleNotFoundResponse = Type.Object({
  error: Type.Literal('Locale not found'),
});

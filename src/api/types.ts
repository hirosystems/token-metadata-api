import { Static, Type } from '@sinclair/typebox';

export const SmartContractRegEx =
  /[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}\.[a-zA-Z]([a-zA-Z0-9]|[-_]){0,39}/;

export const TokenQuerystringParams = Type.Object({
  locale: Type.Optional(
    Type.String({ description: 'Metadata localization to retrieve', examples: ['es-MX', 'jp'] })
  ),
});

export const MetadataAttribute = Type.Object({
  trait_type: Type.String(),
  value: Type.Any(),
  display_type: Type.Optional(Type.String()),
});

export const MetadataProperties = Type.Record(Type.String(), Type.Any());

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
  attributes: Type.Optional(Type.Array(MetadataAttribute)),
  properties: Type.Optional(MetadataProperties),
  localization: Type.Optional(MetadataLocalization),
});
export type MetadataType = Static<typeof Metadata>;

export const TokenNotFoundResponse = Type.Object({
  error: Type.Literal('Token not found'),
});
export const TokenNotProcessedResponse = Type.Object({
  error: Type.Literal('Token metadata fetch in progress'),
});
export const TokenLocaleNotFoundResponse = Type.Object({
  error: Type.Literal('Locale not found'),
});

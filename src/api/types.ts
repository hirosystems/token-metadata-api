import { Static, Type } from '@sinclair/typebox';

export const SmartContractPrincipal = Type.RegEx(
  /[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{28,41}\.[a-zA-Z]([a-zA-Z0-9]|[-_]){0,39}/
);
export type SmartContractPrincipalType = Static<typeof SmartContractPrincipal>;

export const TokenQuerystringParams = Type.Object({
  locale: Type.Optional(Type.String())
});
export type TokenQuerystringParamsType = Static<typeof TokenQuerystringParams>;

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

export const TokenNotFoundResponse = Type.Object({
  error: Type.Literal('Token not found')
});
export type TokenNotFoundResponseType = Static<typeof TokenNotFoundResponse>;

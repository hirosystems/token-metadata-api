import { Static, Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

/**
 * Raw metadata object types. We will allow `any` types here and validate each field towards its
 * expected value later.
 */
const RawMetadata = Type.Object(
  {
    name: Type.Optional(Type.Any()),
    description: Type.Optional(Type.Any()),
    image: Type.Optional(Type.Any()),
    attributes: Type.Optional(Type.Any()),
    properties: Type.Optional(Type.Any()),
    localization: Type.Optional(Type.Any()),
    // Properties below are not SIP-016 compliant.
    imageUrl: Type.Optional(Type.Any()),
    image_url: Type.Optional(Type.Any()),
  },
  { additionalProperties: true }
);
export type RawMetadata = Static<typeof RawMetadata>;
export const RawMetadataCType = TypeCompiler.Compile(RawMetadata);

// Raw metadata localization types.
const RawMetadataLocalization = Type.Object({
  uri: Type.String(),
  default: Type.String(),
  locales: Type.Array(Type.String()),
});
export const RawMetadataLocalizationCType = TypeCompiler.Compile(RawMetadataLocalization);

// Raw metadata attribute types.
const RawMetadataAttribute = Type.Object({
  trait_type: Type.String(),
  value: Type.Any(),
  display_type: Type.Optional(Type.String()),
});
const RawMetadataAttributes = Type.Array(RawMetadataAttribute);
export const RawMetadataAttributesCType = TypeCompiler.Compile(RawMetadataAttributes);

// Raw metadata property types.
const RawMetadataProperties = Type.Record(Type.String(), Type.Any());
export const RawMetadataPropertiesCType = TypeCompiler.Compile(RawMetadataProperties);

export type RawMetadataLocale = {
  metadata: RawMetadata;
  locale?: string;
  default: boolean;
  uri: string;
};

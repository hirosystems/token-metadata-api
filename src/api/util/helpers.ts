import { DbMetadataLocaleBundle } from '../../pg/types';
import { MetadataPropertiesType, MetadataType, MetadataValueType } from '../types';

export function parseMetadataLocaleBundle(
  locale?: DbMetadataLocaleBundle
): MetadataType | undefined {
  let response: MetadataType | undefined;
  if (locale && locale.metadata) {
    response = {
      sip: locale.metadata.sip,
      name: locale.metadata.name ?? undefined,
      description: locale.metadata.description ?? undefined,
      image: locale.metadata.image ?? undefined,
    };
    if (locale.attributes.length > 0) {
      response.attributes = locale.attributes.map(item => ({
        trait_type: item.trait_type,
        value: JSON.parse(item.value) as MetadataValueType,
        display_type: item.display_type ?? undefined,
      }));
    }
    if (locale.properties.length > 0) {
      const mergedProperties: MetadataPropertiesType = {};
      for (const property of locale.properties) {
        if (property.value) {
          mergedProperties[property.name] = JSON.parse(property.value) as MetadataValueType;
        }
      }
      response.properties = mergedProperties;
    }
  }
  return response;
}

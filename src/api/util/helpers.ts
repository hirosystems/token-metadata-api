import { DbMetadataLocaleBundle } from '../../pg/types';
import { MetadataType } from '../types';

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
        value: JSON.parse(item.value),
        display_type: item.display_type ?? undefined,
      }));
    }
    if (locale.properties.length > 0) {
      const mergedProperties: { [k: string]: any } = {};
      for (const property of locale.properties) {
        if (property.value) {
          mergedProperties[property.name] = JSON.parse(property.value);
        }
      }
      response.properties = mergedProperties;
    }
  }
  return response;
}

import { IncomingMessage } from 'http';
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
        value: item.value as MetadataValueType,
        display_type: item.display_type ?? undefined,
      }));
    }
    if (locale.properties.length > 0) {
      const mergedProperties: MetadataPropertiesType = {};
      for (const property of locale.properties) {
        if (property.value) {
          mergedProperties[property.name] = property.value as MetadataValueType;
        }
      }
      response.properties = mergedProperties;
    }
  }
  return response;
}

/**
 * Rewrites a URL to include the API version, e.g.:
 * `/metadata/nft/{principal}/{token_id}` -\> `/metadata/v1/nft/{principal}/{token_id}`
 * @param url - Incoming URL
 * @returns rewritten URL
 */
export function rewriteVersionedUrl(url?: string) {
  if (url) {
    const components = url.substring(1).split('/');
    const first = components.shift();
    if (first === 'metadata' && !components[0].match(/v[0-9]+/)) {
      return `/metadata/v1/${components.join('/')}`;
    }
    return url;
  }
  return '/';
}

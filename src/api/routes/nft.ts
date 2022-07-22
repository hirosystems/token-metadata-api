import { FastifyPluginCallback } from 'fastify';
import {
  NonFungibleTokenResponse,
  NonFungibleTokenParams,
  NonFungibleTokenParamsType,
  NonFungibleTokenResponseType
} from '../types';
import { parseMetadataLocaleBundle } from '../util/helpers';

export const NftRoutes: FastifyPluginCallback = (fastify, options, done) => {
  fastify.get<{
    Params: NonFungibleTokenParamsType,
    Reply: NonFungibleTokenResponseType
  }>('/nft/:principal/:token_id', {
    schema: {
      params: NonFungibleTokenParams,
      response: {
        200: NonFungibleTokenResponse
      },
    }
  }, async (request, reply) => {
    const metadataBundle = await fastify.db.getNftMetadataBundle({
      contractPrincipal: request.params.principal,
      tokenNumber: request.params.token_id
    });
    const response: NonFungibleTokenResponseType = {
      token_uri: metadataBundle?.token?.uri ?? undefined,
      metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale)
    };
    reply.send(response);
  });
  done();
}

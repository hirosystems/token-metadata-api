import { FastifyPluginCallback } from 'fastify';
import {
  FungibleTokenResponse,
  FungibleTokenParams,
  FungibleTokenParamsType,
  FungibleTokenResponseType
} from '../types';
import { parseMetadataLocaleBundle } from '../util/helpers';

export const FtRoutes: FastifyPluginCallback = (fastify, options, done) => {
  fastify.get<{
    Params: FungibleTokenParamsType,
    Reply: FungibleTokenResponseType
  }>('/ft/:principal', {
    schema: {
      params: FungibleTokenParams,
      response: {
        200: FungibleTokenResponse,
      }
    }
  }, async (request, reply) => {
    const metadataBundle = await fastify.db.getFtMetadataBundle({
      contractPrincipal: request.params.principal
    });
    const response: FungibleTokenResponseType = {
      name: metadataBundle?.token?.name ?? undefined,
      symbol: metadataBundle?.token?.symbol ?? undefined,
      decimals: metadataBundle?.token?.decimals ?? undefined,
      total_supply: metadataBundle?.token?.total_supply ?? undefined,
      token_uri: metadataBundle?.token?.uri ?? undefined,
      metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale)
    };
    reply.send(response);
  });
  done();
}

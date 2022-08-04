import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  SmartContractPrincipal,
  Metadata,
  TokenNotFoundResponse,
  TokenQuerystringParams
} from '../types';
import { handleTokenCache } from '../util/cache';
import { parseMetadataLocaleBundle } from '../util/helpers';

export const FtRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.addHook('preHandler', handleTokenCache);
  fastify.get('/ft/:principal', {
    schema: {
      tags: ['Tokens'],
      params: Type.Object({
        principal: SmartContractPrincipal,
      }),
      querystring: TokenQuerystringParams,
      response: {
        200: Type.Object({
          name: Type.Optional(Type.String()),
          symbol: Type.Optional(Type.String()),
          decimals: Type.Optional(Type.Integer()),
          total_supply: Type.Optional(Type.Integer()),
          token_uri: Type.Optional(Type.String({ format: 'uri' })),
          metadata: Type.Optional(Metadata),
        }),
        404: TokenNotFoundResponse
      }
    }
  }, async (request, reply) => {
    const metadataBundle = await fastify.db.getFtMetadataBundle({
      contractPrincipal: request.params.principal,
      locale: request.query.locale
    });
    if (!metadataBundle) {
      reply.code(404).send({ error: 'Token not found' });
      return;
    }
    reply.send({
      name: metadataBundle?.token?.name ?? undefined,
      symbol: metadataBundle?.token?.symbol ?? undefined,
      decimals: metadataBundle?.token?.decimals ?? undefined,
      total_supply: metadataBundle?.token?.total_supply ?? undefined,
      token_uri: metadataBundle?.token?.uri ?? undefined,
      metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale)
    });
  });
  done();
}

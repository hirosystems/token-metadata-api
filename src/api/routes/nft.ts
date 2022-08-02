import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { SmartContractPrincipal, Metadata } from '../types';
import { parseMetadataLocaleBundle } from '../util/helpers';

export const NftRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get('/nft/:principal/:token_id', {
    schema: {
      tags: ['Tokens'],
      params: Type.Object({
        principal: SmartContractPrincipal,
        token_id: Type.Integer(),
      }),
      response: {
        200: Type.Object({
          token_uri: Type.Optional(Type.String({ format: 'uri' })),
          metadata: Type.Optional(Metadata),
        })
      },
    }
  }, async (request, reply) => {
    const metadataBundle = await fastify.db.getNftMetadataBundle({
      contractPrincipal: request.params.principal,
      tokenNumber: request.params.token_id
    });
    reply.send({
      token_uri: metadataBundle?.token?.uri ?? undefined,
      metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale)
    });
  });
  done();
}

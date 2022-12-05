import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Metadata, SmartContractRegEx, TokenQuerystringParams } from '../types';
import { handleTokenCache } from '../util/cache';
import { parseMetadataLocaleBundle } from '../util/helpers';
import { generateTokenErrorResponse, TokenErrorResponseSchema } from '../util/errors';

export const NftRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', handleTokenCache);
  fastify.get(
    '/nft/:principal/:token_id',
    {
      schema: {
        summary: 'Non-Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-009 Non-Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: Type.RegEx(SmartContractRegEx, {
            description: 'SIP-009 compliant smart contract principal',
            examples: ['SP497E7RX3233ATBS2AB9G4WTHB63X5PBSP5VGAQ.boomboxes-cycle-12'],
          }),
          token_id: Type.Integer({ description: 'Token ID to retrieve', examples: ['35'] }),
        }),
        querystring: TokenQuerystringParams,
        response: {
          200: Type.Object({
            token_uri: Type.Optional(Type.String({ format: 'uri' })),
            metadata: Type.Optional(Metadata),
          }),
          ...TokenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const metadataBundle = await fastify.db.getNftMetadataBundle({
          contractPrincipal: request.params.principal,
          tokenNumber: request.params.token_id,
          locale: request.query.locale,
        });
        await reply.send({
          token_uri: metadataBundle?.token?.uri ?? undefined,
          metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale),
        });
      } catch (error) {
        await generateTokenErrorResponse(error, reply);
      }
    }
  );
  done();
};

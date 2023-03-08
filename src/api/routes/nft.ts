import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  Metadata,
  NftPrincipalParam,
  TokenIdParam,
  TokenQuerystringParams,
  TokenUri,
} from '../schemas';
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
        operationId: 'getNftMetadata',
        summary: 'Non-Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-009 Non-Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: NftPrincipalParam,
          token_id: TokenIdParam,
        }),
        querystring: TokenQuerystringParams,
        response: {
          200: Type.Object({
            token_uri: Type.Optional(TokenUri),
            metadata: Type.Optional(Metadata),
          }),
          ...TokenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const metadataBundle = await fastify.db.getTokenMetadataBundle({
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

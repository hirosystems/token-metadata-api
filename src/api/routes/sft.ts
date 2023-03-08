import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  Decimals,
  Metadata,
  SftPrincipalParam,
  SmartContractRegEx,
  TokenIdParam,
  TokenQuerystringParams,
  TokenUri,
  TotalSupply,
} from '../schemas';
import { handleTokenCache } from '../util/cache';
import { parseMetadataLocaleBundle } from '../util/helpers';
import { generateTokenErrorResponse, TokenErrorResponseSchema } from '../util/errors';

export const SftRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', handleTokenCache);
  fastify.get(
    '/sft/:principal/:token_id',
    {
      schema: {
        operationId: 'getSftMetadata',
        summary: 'Semi-Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-013 Semi-Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: SftPrincipalParam,
          token_id: TokenIdParam,
        }),
        querystring: TokenQuerystringParams,
        response: {
          200: Type.Object({
            token_uri: Type.Optional(TokenUri),
            decimals: Type.Optional(Decimals),
            total_supply: Type.Optional(TotalSupply),
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
          decimals: metadataBundle?.token?.decimals ?? undefined,
          total_supply: metadataBundle?.token?.total_supply?.toString() ?? undefined,
          metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale),
        });
      } catch (error) {
        await generateTokenErrorResponse(error, reply);
      }
    }
  );
  done();
};

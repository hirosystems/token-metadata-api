import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  Decimals,
  FtPrincipalParam,
  Metadata,
  Name,
  SmartContractRegEx,
  Symbol,
  TokenQuerystringParams,
  TokenUri,
  TotalSupply,
} from '../schemas';
import { handleTokenCache } from '../util/cache';
import { generateTokenErrorResponse, TokenErrorResponseSchema } from '../util/errors';
import { parseMetadataLocaleBundle } from '../util/helpers';

export const FtRoutes: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.addHook('preHandler', handleTokenCache);
  fastify.get(
    '/ft/:principal',
    {
      schema: {
        operationId: 'getFtMetadata',
        summary: 'Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-010 Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: FtPrincipalParam,
        }),
        querystring: TokenQuerystringParams,
        response: {
          200: Type.Object({
            name: Type.Optional(Name),
            symbol: Type.Optional(Symbol),
            decimals: Type.Optional(Decimals),
            total_supply: Type.Optional(TotalSupply),
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
          tokenNumber: 1,
          locale: request.query.locale,
        });
        await reply.send({
          name: metadataBundle?.token?.name ?? undefined,
          symbol: metadataBundle?.token?.symbol ?? undefined,
          decimals: metadataBundle?.token?.decimals ?? undefined,
          total_supply: metadataBundle?.token?.total_supply?.toString() ?? undefined,
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

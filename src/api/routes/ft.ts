import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { FtMetadataResponse, FtPrincipalParam, TokenQuerystringParams } from '../schemas';
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
          200: FtMetadataResponse,
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
          description: metadataBundle?.metadataLocale?.metadata?.description ?? undefined,
          tx_id: metadataBundle?.smartContract.tx_id,
          sender_address: metadataBundle?.smartContract.principal.split('.')[0],
          image_uri: metadataBundle?.metadataLocale?.metadata?.cached_image ?? undefined,
          image_canonical_uri: metadataBundle?.metadataLocale?.metadata?.image ?? undefined,
          metadata: parseMetadataLocaleBundle(metadataBundle?.metadataLocale),
        });
      } catch (error) {
        await generateTokenErrorResponse(error, reply);
      }
    }
  );
  done();
};

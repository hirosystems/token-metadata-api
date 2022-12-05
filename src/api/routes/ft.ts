import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import { Metadata, SmartContractRegEx, TokenQuerystringParams } from '../types';
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
        summary: 'Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-010 Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: Type.RegEx(SmartContractRegEx, {
            description: 'Principal for the contract which owns the SIP-010 token',
            examples: ['SP32XCD69XPS3GKDEXAQ29PJRDSD5AR643GNEEBXZ.fari-token'],
          }),
        }),
        querystring: TokenQuerystringParams,
        response: {
          200: Type.Object({
            name: Type.Optional(Type.String()),
            symbol: Type.Optional(Type.String()),
            decimals: Type.Optional(Type.Integer()),
            total_supply: Type.Optional(Type.String()),
            token_uri: Type.Optional(Type.String({ format: 'uri' })),
            metadata: Type.Optional(Metadata),
          }),
          ...TokenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const metadataBundle = await fastify.db.getFtMetadataBundle({
          contractPrincipal: request.params.principal,
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

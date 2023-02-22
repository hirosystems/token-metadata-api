import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';
import {
  Decimals,
  Metadata,
  SmartContractRegEx,
  TokenQuerystringParams,
  TokenUri,
  TotalSupply,
} from '../types';
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
        summary: 'Semi-Fungible Token Metadata',
        description: 'Retrieves metadata for a SIP-013 Semi-Fungible Token',
        tags: ['Tokens'],
        params: Type.Object({
          principal: Type.RegEx(SmartContractRegEx, {
            description: 'SIP-013 compliant smart contract principal',
            examples: ['SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.key-alex-autoalex-v1'],
          }),
          token_id: Type.Integer({ description: 'Token ID to retrieve', examples: ['35'] }),
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

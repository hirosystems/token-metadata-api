import Fastify, { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './routes/ft';
import { NftRoutes } from './routes/nft';
import { PgStore } from '../pg/pg-store';
import FastifyCors from '@fastify/cors';
import FastifySwagger from '@fastify/swagger';
import { StatusRoutes } from './routes/status';
import FastifyMetrics from 'fastify-metrics';
import { Server } from 'http';

export const Api: FastifyPluginAsync<Record<never, never>, Server, TypeBoxTypeProvider> = async (
  fastify,
  options
) => {
  await fastify.register(FastifyCors);
  await fastify.register(FastifySwagger, {
    openapi: {
      info: {
        title: 'Stacks Token Metadata Service',
        description:
          'A microservice that indexes metadata for every single Fungible and Non-Fungible Token in the Stacks blockchain and exposes it via REST API endpoints.',
        version: '0.0.1',
      },
      externalDocs: {
        url: 'https://github.com/rafaelcr/token-metadata-service',
        description: 'Source Repository',
      },
      tags: [
        {
          name: 'Tokens',
          description: 'Token metadata',
        },
      ],
    },
    exposeRoute: true,
  });
  await fastify.register(FtRoutes);
  await fastify.register(NftRoutes);
  await fastify.register(StatusRoutes);
};

export async function buildApiServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  if (process.env['NODE_ENV'] === 'production') {
    await fastify.register(FastifyMetrics);
  }
  await fastify.register(Api);

  return fastify;
}

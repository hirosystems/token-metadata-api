import Fastify, { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './routes/ft';
import { NftRoutes } from './routes/nft';
import { SftRoutes } from './routes/sft';
import { PgStore } from '../pg/pg-store';
import FastifyCors from '@fastify/cors';
import FastifySwagger, { SwaggerOptions } from '@fastify/swagger';
import { StatusRoutes } from './routes/status';
import FastifyMetrics from 'fastify-metrics';
import { Server } from 'http';
import { SERVER_VERSION } from '../server-version';
import { PINO_CONFIG } from '../logger';

export const ApiSwaggerOptions: SwaggerOptions = {
  openapi: {
    info: {
      title: 'Stacks Token Metadata Service',
      description:
        'A microservice that indexes metadata for every SIP-009, SIP-010, and SIP-013 Token in the Stacks blockchain and exposes it via REST API endpoints.',
      version: SERVER_VERSION.tag,
    },
    externalDocs: {
      url: 'https://github.com/hirosystems/token-metadata-service',
      description: 'Source Repository',
    },
    tags: [
      {
        name: 'Tokens',
        description: 'Token metadata endpoints',
      },
      {
        name: 'Status',
        description: 'Service status endpoints',
      },
    ],
  },
  exposeRoute: true,
};

export const Api: FastifyPluginAsync<Record<never, never>, Server, TypeBoxTypeProvider> = async (
  fastify,
  options
) => {
  await fastify.register(FtRoutes);
  await fastify.register(NftRoutes);
  await fastify.register(SftRoutes);
  await fastify.register(StatusRoutes);
};

export async function buildApiServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  if (process.env['NODE_ENV'] === 'production') {
    await fastify.register(FastifyMetrics);
  } else if (process.env['NODE_ENV'] === 'development') {
    await fastify.register(FastifySwagger, ApiSwaggerOptions);
  }
  await fastify.register(FastifyCors);
  await fastify.register(Api, { prefix: '/metadata/v1' });

  return fastify;
}

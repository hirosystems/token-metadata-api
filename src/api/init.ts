import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './routes/ft';
import { NftRoutes } from './routes/nft';
import { PgStore } from '../pg/pg-store';
import FastifyCors from '@fastify/cors';
import FastifySwagger from '@fastify/swagger';
import { StatusRoutes } from './routes/status';
import FastifyMetrics from 'fastify-metrics';

export async function buildApiServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: true,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);

  await fastify.register(FastifyCors);
  if (process.env['NODE_ENV'] === 'production') {
    await fastify.register(FastifyMetrics);
  }
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

  return fastify;
}

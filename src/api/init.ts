import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './routes/ft';
import { NftRoutes } from './routes/nft';
import { PgStore } from '../pg/pg-store';
import { ENV } from '../util/env';
import FastifyCors from '@fastify/cors';
import FastifySwagger from '@fastify/swagger';
import { StatusRoutes } from './routes/status';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

export function startApiServer(args: { db: PgStore }) {
  fastify.decorate('db', args.db);

  fastify.register(FastifyCors);
  fastify.register(FastifySwagger, { openapi: {
    info: {
      title: 'Stacks Token Metadata Service',
      description: 'A microservice that indexes metadata for every single Fungible and Non-Fungible Token in the Stacks blockchain and exposes it via REST API endpoints.',
      version: '0.0.1',
    },
    externalDocs: {
      url: 'https://github.com/rafaelcr/token-metadata-service',
      description: 'Source Repository'
    },
    tags: [{
      name: 'Tokens',
      description: 'Token metadata'
    }],
  }, exposeRoute: true });

  fastify.register(FtRoutes);
  fastify.register(NftRoutes);
  fastify.register(StatusRoutes);

  fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT }, (err, address) => {
    if (err) {
      fastify.log.error(err)
      // process.exit(1)
    }
  });
  console.info(`API listening on ${ENV.API_HOST}:${ENV.API_PORT}`);
}

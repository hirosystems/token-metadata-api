import Fastify, { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './routes/ft';
import { NftRoutes } from './routes/nft';
import { SftRoutes } from './routes/sft';
import { PgStore } from '../pg/pg-store';
import FastifyCors from '@fastify/cors';
import { StatusRoutes } from './routes/status';
import FastifyMetrics from 'fastify-metrics';
import { Server } from 'http';
import { PINO_CONFIG } from '../logger';

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
  }
  await fastify.register(FastifyCors);
  await fastify.register(Api, { prefix: '/metadata/v1' });
  await fastify.register(Api, { prefix: '/metadata' });

  return fastify;
}

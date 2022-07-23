import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './routes/ft';
import { NftRoutes } from './routes/nft';
import { PgStore } from '../pg/pg-store';
import { ENV } from '../util/env';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

export function startApiServer(args: { db: PgStore }) {
  fastify.decorate('db', args.db);
  fastify.register(FtRoutes);
  fastify.register(NftRoutes);

  fastify.get('/', (request, reply) => {
    reply.send({ status: 'ok' });
  });

  fastify.listen({ host: ENV.API_HOST, port: ENV.API_PORT }, (err, address) => {
    if (err) {
      fastify.log.error(err)
      // process.exit(1)
    }
  });
  console.info(`API listening on ${ENV.API_HOST}:${ENV.API_PORT}`);
}

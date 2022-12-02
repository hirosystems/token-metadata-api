import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { Api } from './init';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
  maxParamLength: 1048576, // 1MB
}).withTypeProvider<TypeBoxTypeProvider>();

export default async (req: any, res: any) => {
  await fastify.register(Api);
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

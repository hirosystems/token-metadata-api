import * as dotenv from 'dotenv';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { Api } from '../src/api/init';

dotenv.config();

const fastify = Fastify({
  trustProxy: true,
  logger: true,
  maxParamLength: 1048576, // 1MB
}).withTypeProvider<TypeBoxTypeProvider>();

void fastify.register(Api);

export default async (req: any, res: any) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};

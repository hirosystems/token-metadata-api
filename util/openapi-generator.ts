import Fastify, { FastifyPluginAsync } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Api, ApiSwaggerOptions } from '../src/api/init';
import FastifySwagger from '@fastify/swagger';
import { mkdirSync, writeFileSync } from 'fs';
import { Server } from 'http';

/**
 * Generates an `./openapi.yaml` file based on current Swagger definitions.
 */
export const ApiGenerator: FastifyPluginAsync<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = async (fastify, options) => {
  await fastify.register(FastifySwagger, ApiSwaggerOptions);
  await fastify.register(Api);
  mkdirSync('./tmp');
  writeFileSync('./tmp/openapi.yaml', fastify.swagger({ yaml: true }));
};

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

void fastify.register(ApiGenerator).then(async () => {
  await fastify.close();
});

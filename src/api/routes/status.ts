import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { FastifyPluginCallback } from "fastify";
import { Server } from "http";

export const StatusRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  fastify.get('/', {
    schema: {
      response: {
        200: Type.Object({
          status: Type.String()
        }),
      }
    }
  }, async (request, reply) => {
    reply.send({ status: 'ok' });
  });
  done();
}

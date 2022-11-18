import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { FastifyPluginCallback } from 'fastify';
import { Server } from 'http';

export const StatusRoutes: FastifyPluginCallback<
  Record<never, never>,
  Server,
  TypeBoxTypeProvider
> = (fastify, options, done) => {
  // TODO: Add a job-queue etag cache handler.
  fastify.get(
    '/',
    {
      schema: {
        response: {
          200: Type.Object({
            status: Type.String(),
            tokens: Type.Optional(Type.Record(Type.String(), Type.Integer())),
            token_contracts: Type.Optional(Type.Record(Type.String(), Type.Integer())),
            job_queue: Type.Optional(Type.Record(Type.String(), Type.Integer())),
          }),
        },
      },
    },
    async (request, reply) => {
      const result = await fastify.db.sqlTransaction(async sql => {
        const smartContracts: Record<string, number> = {};
        const contractCounts = await fastify.db.getSmartContractCounts();
        for (const row of contractCounts) {
          smartContracts[row.sip] = row.count;
        }

        const tokens: Record<string, number> = {};
        const tokenCounts = await fastify.db.getTokenCounts();
        for (const row of tokenCounts) {
          tokens[row.type] = row.count;
        }

        const queue: Record<string, number> = {};
        const jobCounts = await fastify.db.getJobStatusCounts();
        for (const row of jobCounts) {
          queue[row.status] = row.count;
        }

        return {
          status: 'ready',
          tokens: tokenCounts.length ? tokens : undefined,
          token_contracts: contractCounts.length ? smartContracts : undefined,
          job_queue: jobCounts.length ? queue : undefined,
        };
      });
      await reply.send(result);
    }
  );
  done();
};

import Fastify, { FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PgStore } from '../pg/pg-store';
import { Server } from 'http';
import { Type } from '@sinclair/typebox';
import { SmartContractRegEx } from '../api/schemas';
import { logger, PINO_LOGGER_CONFIG } from '@hirosystems/api-toolkit';

export const AdminApi: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.post(
    '/refresh-token',
    {
      schema: {
        description:
          'Enqueue a token metadata refresh. This ignores any token refresh modes configured by a SIP-019 notification.',
        body: Type.Object({
          contractId: Type.RegEx(SmartContractRegEx),
          tokenIds: Type.Optional(Type.Array(Type.Integer())),
        }),
      },
    },
    async (request, reply) => {
      await fastify.db.sqlWriteTransaction(async sql => {
        const contract = await fastify.db.getSmartContract({ principal: request.body.contractId });
        if (!contract) {
          await reply.code(422).send({ error: 'Contract not found' });
          return;
        }
        await sql`
          UPDATE jobs
          SET status = 'pending', updated_at = NOW()
          WHERE token_id IN (
            SELECT id
            FROM tokens
            WHERE smart_contract_id = ${contract.id}
              ${
                request.body.tokenIds
                  ? sql`AND token_number IN ${sql(request.body.tokenIds)}`
                  : sql``
              }
          )
        `;
        logger.info(
          request.body.tokenIds,
          `AdminRPC refreshing tokens for contract: ${contract.principal}`
        );
        await reply.code(200).send();
      });
    }
  );

  fastify.post(
    '/retry-failed',
    {
      schema: {
        description: 'Retry all failed and invalid jobs',
      },
    },
    async (request, reply) => {
      await fastify.db.retryAllFailedJobs();
      logger.info(`AdminRPC retrying all failed and invalid jobs`);
      await reply.code(200).send();
    }
  );

  done();
};

export async function buildAdminRpcServer(args: { db: PgStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_LOGGER_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  await fastify.register(AdminApi, { prefix: '/metadata/admin' });

  return fastify;
}

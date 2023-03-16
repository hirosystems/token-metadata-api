import Fastify, { FastifyPluginAsync, FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PgStore } from '../pg/pg-store';
import { Server } from 'http';
import { PINO_CONFIG } from '../logger';
import { Type } from '@sinclair/typebox';
import { SmartContractRegEx } from '../api/schemas';
import { PgBlockchainApiStore } from '../pg/blockchain-api/pg-blockchain-api-store';
import { getSmartContractSip } from '../token-processor/util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';

export const Api: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.post(
    '/fetch-contract',
    { schema: { body: Type.Object({ principal: Type.RegEx(SmartContractRegEx) }) } },
    async (request, reply) => {
      const contract = await fastify.apiDb?.getSmartContract({
        contractId: request.body.principal,
      });
      if (!contract) {
        await reply.code(422).send({ error: 'Contract not found on the Stacks chain' });
        return;
      }
      const sip = getSmartContractSip(contract.abi as ClarityAbi);
      if (!sip) {
        await reply.code(422).send({ error: 'Not a token contract' });
        return;
      }
      await fastify.db.insertAndEnqueueSmartContract({
        values: {
          principal: contract.contract_id,
          sip: sip,
          abi: contract.abi,
          tx_id: contract.tx_id,
          block_height: contract.block_height,
        },
      });
      await reply.code(200);
    }
  );

  done();
};

export async function buildAdminServer(args: { db: PgStore; apiDb: PgBlockchainApiStore }) {
  const fastify = Fastify({
    trustProxy: true,
    logger: PINO_CONFIG,
  }).withTypeProvider<TypeBoxTypeProvider>();

  fastify.decorate('db', args.db);
  fastify.decorate('apiDb', args.apiDb);
  await fastify.register(Api, { prefix: '/metadata/admin' });

  return fastify;
}

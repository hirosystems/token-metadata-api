import Fastify, { FastifyPluginCallback } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PgStore } from '../pg/pg-store';
import { Server } from 'http';
import { Type } from '@sinclair/typebox';
import { SmartContractRegEx } from '../api/schemas';
import {
  getSmartContractSip,
  tokenClassFromSipNumber,
  TokenMetadataUpdateNotification,
} from '../token-processor/util/sip-validation';
import { ClarityAbi } from '@stacks/transactions';
import { DbTokenUpdateMode } from '../pg/types';
import { logger, PINO_LOGGER_CONFIG } from '@hirosystems/api-toolkit';

export const AdminApi: FastifyPluginCallback<Record<never, never>, Server, TypeBoxTypeProvider> = (
  fastify,
  options,
  done
) => {
  fastify.post(
    '/import-contract',
    {
      schema: {
        description: 'Import a contract from the Stacks chain and enqueue for processing',
        body: Type.Object({ contractId: Type.RegEx(SmartContractRegEx) }),
      },
    },
    async (request, reply) => {
      // const contract = await fastify.apiDb?.getSmartContract({
      //   contractId: request.body.contractId,
      // });
      // if (!contract) {
      //   await reply.code(422).send({ error: 'Contract not found' });
      //   return;
      // }
      // const sip = getSmartContractSip(contract.abi as ClarityAbi);
      // if (!sip) {
      //   await reply.code(422).send({ error: 'Not a token contract' });
      //   return;
      // }
      // await fastify.db.chainhook.insertAndEnqueueSmartContract({
      //   values: {
      //     principal: contract.contract_id,
      //     sip: sip,
      //     abi: contract.abi,
      //     tx_id: contract.tx_id,
      //     block_height: contract.block_height,
      //   },
      // });
      // logger.info(`AdminRPC imported contract: ${contract.contract_id}`);
      await reply.code(200).send();
    }
  );

  fastify.post(
    '/refresh-token',
    {
      schema: {
        description: 'Enqueue a token metadata refresh by simulating a SIP-019 notification',
        body: Type.Object({
          contractId: Type.RegEx(SmartContractRegEx),
          tokenIds: Type.Optional(Type.Array(Type.Integer())),
        }),
      },
    },
    async (request, reply) => {
      // const contract = await fastify.db.getSmartContract({ principal: request.body.contractId });
      // if (!contract) {
      //   await reply.code(422).send({ error: 'Contract not found' });
      //   return;
      // }
      // const notification: TokenMetadataUpdateNotification = {
      //   token_class: tokenClassFromSipNumber(contract.sip),
      //   contract_id: contract.principal,
      //   token_ids: (request.body.tokenIds ?? []).map(v => BigInt(v)),
      //   update_mode: DbTokenUpdateMode.standard,
      // };
      // // await fastify.db.enqueueTokenMetadataUpdateNotification({ notification });
      // logger.info(
      //   request.body.tokenIds,
      //   `AdminRPC refreshing tokens for contract: ${contract.principal}`
      // );
      await reply.code(200).send();
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

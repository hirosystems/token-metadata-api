import { FastifyPluginCallback } from 'fastify';
import {
  NonFungibleTokenResponse,
  NonFungibleTokenParams,
  NonFungibleTokenParamsType,
  NonFungibleTokenResponseType
} from './types';

export const NftRoutes: FastifyPluginCallback = (fastify, options, done) => {
  fastify.get<{
    Params: NonFungibleTokenParamsType,
    Reply: NonFungibleTokenResponseType
  }>('/nft/:contract_id/:token_id', {
    schema: {
      params: NonFungibleTokenParams,
      response: {
        200: NonFungibleTokenResponse
      },
    }
  }, (request, reply) => {
    const contractId = request.params.contract_id;
    const tokenId = request.params.token_id;
    reply.send({
      token_uri: 'https://cdn.citycoins.co/metadata/newyorkcitycoin.json',
      metadata: {
        sip: 10,
        name: 'NewYorkCityCoin',
        description: 'A CityCoin for New York City, ticker is NYC, Stack it to earn Stacks (STX)',
        image: 'https://cdn.citycoins.co/logos/newyorkcitycoin.png'
      }
    });
  });
  done();
}

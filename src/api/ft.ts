import { FastifyPluginCallback } from 'fastify';
import {
  FungibleTokenResponse,
  FungibleTokenParams,
  FungibleTokenParamsType,
  FungibleTokenResponseType
} from './types';

export const FtRoutes: FastifyPluginCallback = (fastify, options, done) => {
  fastify.get<{
    Params: FungibleTokenParamsType,
    Reply: FungibleTokenResponseType
  }>('/ft/:contract_id', {
    schema: {
      params: FungibleTokenParams,
      response: {
        200: FungibleTokenResponse,
      }
    }
  }, (request, reply) => {
    const contractId = request.params.contract_id;
    reply.send({
      name: 'NewYorkCityCoin',
      symbol: 'NYC',
      decimals: 6,
      total_supply: 200,
      token_uri: 'https://cdn.citycoins.co/metadata/newyorkcitycoin.json',
      metadata: {
        sip: 9,
        name: 'NewYorkCityCoin',
        description: 'A CityCoin for New York City, ticker is NYC, Stack it to earn Stacks (STX)',
        image: 'https://cdn.citycoins.co/logos/newyorkcitycoin.png'
      }
    });
  });
  done();
}

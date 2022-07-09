import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FungibleTokenParams, FungibleTokenParamsType, FungibleTokenType, NonFungibleTokenParams, NonFungibleTokenParamsType, NonFungibleTokenType } from './api/types';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

// Declare a route
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' });
});

fastify.get<{ Params: FungibleTokenParamsType, Reply: FungibleTokenType }>('/ft/:contract_id', { schema: { params: FungibleTokenParams } }, (request, reply) => {
  request.validationError
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

fastify.get<{ Params: NonFungibleTokenParamsType, Reply: NonFungibleTokenType }>('/nft/:contract_id/:token_id', { schema: { params: NonFungibleTokenParams } }, (request, reply) => {
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

// Run the server!
fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    // process.exit(1)
  }
  // Server is now listening on ${address}
})

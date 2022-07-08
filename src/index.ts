import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FungibleTokenSchema } from './api/types';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

// Declare a route
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' });
});

fastify.get<{ Reply: FungibleTokenSchema }>('/ft/:contract_id', function (request, reply) {
  reply.send({
    name: 'MiamiCoin',
    symbol: 'MIA',
    decimals: 6,
    total_supply: 200,
    token_uri: 'https://cdn.citycoins.co/metadata/newyorkcitycoin.json'
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

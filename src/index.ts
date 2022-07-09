import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { FtRoutes } from './api/ft';
import { NftRoutes } from './api/nft';

const fastify = Fastify({
  trustProxy: true,
  logger: true,
}).withTypeProvider<TypeBoxTypeProvider>();

// Declare a route
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' });
});

fastify.register(FtRoutes);
fastify.register(NftRoutes);

// Run the server!
fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    // process.exit(1)
  }
  // Server is now listening on ${address}
})

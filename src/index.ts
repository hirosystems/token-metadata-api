import Fastify from "fastify";

const fastify = Fastify({
  logger: true
});

// Declare a route
fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' })
})

// Run the server!
fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    // process.exit(1)
  }
  // Server is now listening on ${address}
})

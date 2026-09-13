import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Prisma } from '@prisma/client';
import { hasZodFastifySchemaValidationErrors, jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { authPlugin } from './plugins/auth.js';
import { AppError } from './lib/errors.js';
import { systemRoutes } from './routes/system.js';
import { propertyRoutes } from './routes/properties.js';
import { rateRoutes } from './routes/rates.js';
import { guestRoutes } from './routes/guests.js';
import { reservationRoutes } from './routes/reservations.js';
import { folioRoutes } from './routes/folios.js';
import { housekeepingRoutes } from './routes/housekeeping.js';
import { operationsRoutes } from './routes/operations.js';
import { posRoutes } from './routes/pos.js';
import { inventoryRoutes } from './routes/inventory.js';
import { activityRoutes } from './routes/activities.js';
import { complianceRoutes } from './routes/compliance.js';
import { channelRoutes } from './routes/channels.js';
import { guestLayerRoutes } from './routes/guestLayer.js';
import { webhookRoutes } from './routes/webhooks.js';
import { publicRoutes } from './routes/public.js';

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: (process.env.CORS_ORIGIN ?? '*').split(',') });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Ashrafy PMS API',
        version: '0.1.0',
        description:
          'Public, documented REST + webhook API for the Ashrafy hotel property-management system. ' +
          'Authenticate with the `x-api-key` header. Routes under /api/public need no key.',
      },
      components: { securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } } },
      security: [{ apiKey: [] }],
      tags: [
        { name: 'system' },
        { name: 'properties' },
        { name: 'rates' },
        { name: 'availability' },
        { name: 'guests' },
        { name: 'reservations' },
        { name: 'folios' },
        { name: 'housekeeping' },
        { name: 'operations', description: 'Night audit, dashboard, alerts, reports' },
        { name: 'pos' },
        { name: 'inventory' },
        { name: 'activities' },
        { name: 'compliance' },
        { name: 'channels' },
        { name: 'guest-layer', description: 'Messaging and reputation' },
        { name: 'webhooks' },
        { name: 'public', description: 'Pricing, booking engine and guest programme (no API key)' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(authPlugin);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    if (hasZodFastifySchemaValidationErrors(err)) return reply.status(400).send({ error: { code: 'VALIDATION', message: 'Request validation failed', details: err.validation } });
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return reply.status(409).send({ error: { code: 'DUPLICATE', message: 'A record with the same unique value already exists', details: err.meta } });
      if (err.code === 'P2025') return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
      // Foreign key violation: an id in the request does not point at anything real.
      if (err.code === 'P2003') return reply.status(400).send({ error: { code: 'INVALID_REFERENCE', message: 'A referenced record does not exist' } });
    }
    if (err instanceof Prisma.PrismaClientValidationError) {
      app.log.error(err);
      return reply.status(400).send({ error: { code: 'INVALID_REQUEST', message: 'Request could not be processed' } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status < 500) return reply.status(status).send({ error: { code: 'ERROR', message: (err as Error).message } });
    // Never echo an unhandled error to the client: Prisma messages carry model, field and
    // constraint names. The detail stays in the server log, addressable by request id.
    app.log.error(err);
    return reply.status(status).send({ error: { code: 'INTERNAL', message: 'Internal server error', details: { requestId: _req.id } } });
  });

  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  await app.register(systemRoutes);
  await app.register(publicRoutes, { prefix: '/api/public' });
  await app.register(propertyRoutes, { prefix: '/api' });
  await app.register(rateRoutes, { prefix: '/api' });
  await app.register(guestRoutes, { prefix: '/api' });
  await app.register(reservationRoutes, { prefix: '/api' });
  await app.register(folioRoutes, { prefix: '/api' });
  await app.register(housekeepingRoutes, { prefix: '/api' });
  await app.register(operationsRoutes, { prefix: '/api' });
  await app.register(posRoutes, { prefix: '/api' });
  await app.register(inventoryRoutes, { prefix: '/api' });
  await app.register(activityRoutes, { prefix: '/api' });
  await app.register(complianceRoutes, { prefix: '/api' });
  await app.register(channelRoutes, { prefix: '/api' });
  await app.register(guestLayerRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/api' });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

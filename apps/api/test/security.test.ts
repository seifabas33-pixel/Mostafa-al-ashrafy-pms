import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashApiKey } from '../src/lib/ids.js';
import { API_KEY, READONLY_KEY, WRITE_KEY, seedFixture, type Fixture } from './fixture.js';

/**
 * Regression tests for the tenancy and credential defects found in the pre-merge audit.
 *
 * Every case here is an id from ANOTHER organisation submitted in a request body against a
 * property the caller legitimately owns. `requireProperty` passes in all of them, so these
 * prove the second, per-field ownership check is present.
 */

let app: App;
let f: Fixture;
const H = { 'x-api-key': API_KEY, 'content-type': 'application/json' };

beforeAll(async () => {
  f = await seedFixture();
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const api = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = H) => {
  // Fastify rejects an empty body when content-type says JSON, so only send it with a payload.
  const sent = { ...headers };
  if (body === undefined) delete sent['content-type'];
  return app
    .inject({ method, url, headers: sent, ...(body !== undefined ? { payload: JSON.stringify(body) } : {}) })
    .then((r) => ({ status: r.statusCode, body: r.json() }));
};

describe('cross-tenant foreign keys are rejected', () => {
  const P = () => `/api/properties/${f.property.id}`;

  it('refuses a guest message that points at another org\'s guest', async () => {
    const r = await api('POST', `${P()}/messages`, { guestId: f.other.guest.id, body: 'hello' });
    expect(r.status).toBe(404);
    const list = await api('GET', `${P()}/messages`);
    expect(JSON.stringify(list.body)).not.toContain('SECRET-1');
  });

  it('refuses a review that points at another property\'s reservation', async () => {
    const r = await api('POST', `${P()}/reviews`, { reservationId: f.other.reservation.id, rating: 5 });
    expect(r.status).toBe(404);
  });

  it('refuses a housekeeping task on another property\'s room', async () => {
    const r = await api('POST', `${P()}/housekeeping/tasks`, { roomId: f.other.room.id, type: 'MAINTENANCE' });
    expect(r.status).toBe(404);
    const room = await prisma.room.findUniqueOrThrow({ where: { id: f.other.room.id } });
    expect(room.status).toBe('OUT_OF_ORDER'); // never flipped back into sale
  });

  it('refuses a compliance submission for another property\'s folio or reservation', async () => {
    expect((await api('POST', `${P()}/compliance`, { type: 'ETA_EINVOICE', entityType: 'FOLIO', entityId: f.other.folio.id })).status).toBe(404);
    expect((await api('POST', `${P()}/compliance`, { type: 'MOI_GUEST_REPORT', entityType: 'RESERVATION', entityId: f.other.reservation.id })).status).toBe(404);
    const processed = await api('POST', `${P()}/compliance/process`, {});
    expect(JSON.stringify(processed.body)).not.toContain('SECRET-1');
  });

  it('refuses a purchase order built from another property\'s supplier, warehouse or ingredient', async () => {
    const foreign = await api('POST', `${P()}/purchase-orders`, {
      supplierId: f.other.supplier.id,
      warehouseId: f.other.warehouse.id,
      lines: [{ ingredientId: f.other.ingredient.id, quantity: 1, unitCost: 1 }],
    });
    expect(foreign.status).toBe(404);
    const mixed = await api('POST', `${P()}/purchase-orders`, {
      supplierId: f.supplier.id,
      warehouseId: f.warehouse.id,
      lines: [{ ingredientId: f.other.ingredient.id, quantity: 1, unitCost: 1 }],
    });
    expect(mixed.status).toBe(404);
    const list = await api('GET', `${P()}/purchase-orders`);
    expect(JSON.stringify(list.body)).not.toContain('Rival Truffle');
  });

  it('refuses a stock adjustment against another property\'s ingredient', async () => {
    const r = await api('POST', `${P()}/stock/adjust`, { warehouseId: f.warehouse.id, ingredientId: f.other.ingredient.id, quantity: 5 });
    expect(r.status).toBe(404);
  });

  it('refuses an inbound OTA reservation on another property\'s channel connection', async () => {
    const r = await api('POST', `${P()}/channels/${f.other.channel.id}/reservations`, {
      externalRef: 'X1',
      guest: { firstName: 'A', lastName: 'B' },
      roomTypeCode: 'STD',
      arrival: '2026-10-20',
      departure: '2026-10-22',
    });
    expect(r.status).toBe(404);
    expect(await prisma.channelSyncLog.count({ where: { connectionId: f.other.channel.id } })).toBe(0);
  });
});

describe('API key handling', () => {
  it('stores only a digest, never the plaintext key', async () => {
    const stored = await prisma.apiKey.findMany({ where: { orgId: f.org.id } });
    expect(stored.length).toBeGreaterThan(0);
    for (const k of stored) {
      expect(Object.values(k)).not.toContain(API_KEY);
      expect(k.keyHash).not.toBe(API_KEY);
    }
    const full = stored.find((k) => k.name === 'full');
    expect(full?.keyHash).toBe(hashApiKey(API_KEY));
  });

  it('lets a write-scoped key act but not mint or list credentials', async () => {
    const writeHeaders = { 'x-api-key': WRITE_KEY, 'content-type': 'application/json' };
    expect((await api('GET', '/api/properties', undefined, writeHeaders)).status).toBe(200);
    const minted = await api('POST', '/api/api-keys', { name: 'escalation', scopes: ['admin'] }, writeHeaders);
    expect(minted.status).toBe(403);
    expect((await api('GET', '/api/api-keys', undefined, writeHeaders)).status).toBe(403);
  });

  it('returns a new key once and then only its prefix', async () => {
    const created = await api('POST', '/api/api-keys', { name: 'integration', scopes: ['read'] });
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^pms_/);
    expect(created.body.keyHash).toBeUndefined();

    const listed = await api('GET', '/api/api-keys');
    const row = listed.body.find((k: { name: string }) => k.name === 'integration');
    expect(row.key).toBe(`${created.body.key.slice(0, 12)}…`);
    expect(row.keyHash).toBeUndefined();

    // The key works, and revoking it stops it working.
    expect((await api('GET', '/api/properties', undefined, { 'x-api-key': created.body.key })).status).toBe(200);
    expect((await api('DELETE', `/api/api-keys/${created.body.id}`)).status).toBe(200);
    expect((await api('GET', '/api/properties', undefined, { 'x-api-key': created.body.key })).status).toBe(401);
  });

  it('still rejects a read-only key on writes', async () => {
    const r = await api('POST', `/api/properties/${f.property.id}/night-audit`, {}, { 'x-api-key': READONLY_KEY, 'content-type': 'application/json' });
    expect(r.status).toBe(403);
  });
});

describe('webhook endpoints cannot target the internal network', () => {
  it('rejects loopback, private, link-local and non-https urls', async () => {
    for (const url of [
      'http://example.com/hook',
      'https://127.0.0.1/hook',
      'https://localhost/hook',
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/hook',
      'https://[::1]/hook',
      'https://svc.internal/hook',
    ]) {
      const r = await api('POST', '/api/webhooks', { url, events: ['reservation.created'] });
      expect(r.status, url).toBe(400);
    }
  });

  it('accepts a public https endpoint', async () => {
    const r = await api('POST', '/api/webhooks', { url: 'https://hooks.example.com/pms', events: ['reservation.created'] });
    expect(r.status).toBe(201);
  });
});

describe('error responses do not leak internals', () => {
  it('turns a bad foreign key into a clean 400 rather than a Prisma message', async () => {
    const r = await api('POST', `/api/properties/${f.property.id}/rooms`, { roomTypeId: 'does-not-exist', number: '999' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    const body = JSON.stringify(r.body);
    expect(body).not.toContain('constraint');
    expect(body).not.toMatch(/prisma/i);
  });
});

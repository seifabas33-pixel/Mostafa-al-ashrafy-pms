import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { badRequest } from './errors.js';

/**
 * Outbound-request guard for tenant-supplied URLs (webhook endpoints).
 *
 * Without this a tenant can point a webhook at the server's own network — loopback,
 * RFC1918, or the cloud metadata endpoint — and use the recorded response code as a
 * blind-SSRF oracle. Validation happens twice on purpose:
 *
 *  - `assertAllowedWebhookUrl` runs at subscription time on the literal URL. It deliberately
 *    does no DNS, so registering an endpoint whose host is not resolvable yet still works.
 *  - `resolvePublicHost` runs immediately before every delivery and re-resolves the hostname,
 *    which is what closes DNS rebinding. Redirects are not followed, so a public URL cannot
 *    bounce to an internal one.
 *
 * Set WEBHOOKS_ALLOW_HTTP=1 (development only) to permit plain http and private targets.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data']);

function allowInsecure(): boolean {
  return process.env.WEBHOOKS_ALLOW_HTTP === '1';
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase().split('%')[0];
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
  if (v.startsWith('fe80')) return true; // link-local
  if (v.startsWith('::ffff:')) return isPrivateV4(v.slice(7)); // IPv4-mapped
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true;
}

/** Subscription-time validation. Scheme, obvious hostnames and literal private IPs. */
export function assertAllowedWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Webhook url must be an absolute URL');
  }
  const insecureOk = allowInsecure();
  if (url.protocol !== 'https:' && !(insecureOk && url.protocol === 'http:')) {
    throw badRequest('Webhook url must use https');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (insecureOk) return url;
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw badRequest('Webhook url must not point at an internal host');
  }
  if (isIP(host) && isPrivateAddress(host)) {
    throw badRequest('Webhook url must not point at a private address');
  }
  return url;
}

/**
 * Delivery-time check. Re-resolves the hostname and rejects private targets, so a name that
 * resolved publicly at subscription time cannot be re-pointed inward later.
 */
export async function resolvePublicHost(raw: string): Promise<void> {
  if (allowInsecure()) return;
  const url = assertAllowedWebhookUrl(raw);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host)) return; // already checked above
  const addresses = await lookup(host, { all: true });
  if (!addresses.length) throw badRequest('Webhook host does not resolve');
  for (const a of addresses) {
    if (isPrivateAddress(a.address)) throw badRequest('Webhook host resolves to a private address');
  }
}

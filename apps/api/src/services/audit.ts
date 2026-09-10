import { prisma, type Tx } from '../db.js';

export async function audit(
  orgId: string,
  action: string,
  entityType: string,
  entityId: string,
  data: Record<string, unknown> = {},
  opts: { propertyId?: string; actor?: string } = {},
  tx: Tx | typeof prisma = prisma,
) {
  return tx.auditLog.create({
    data: {
      orgId,
      propertyId: opts.propertyId,
      actor: opts.actor ?? 'system',
      action,
      entityType,
      entityId,
      data: JSON.stringify(data),
    },
  });
}

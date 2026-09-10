import { prisma, type Tx } from '../db.js';

/** Create a housekeeping task unless an open one of the same type already exists for the room and day. */
export async function ensureTask(
  args: { propertyId: string; roomId: string; type: string; dueDate: Date; priority?: string; notes?: string },
  tx: Tx | typeof prisma = prisma,
) {
  const existing = await tx.housekeepingTask.findFirst({
    where: { propertyId: args.propertyId, roomId: args.roomId, type: args.type, dueDate: args.dueDate, status: { in: ['PENDING', 'IN_PROGRESS'] } },
  });
  if (existing) {
    if (args.priority && args.priority !== existing.priority) return tx.housekeepingTask.update({ where: { id: existing.id }, data: { priority: args.priority, notes: args.notes ?? existing.notes } });
    return existing;
  }
  return tx.housekeepingTask.create({ data: { propertyId: args.propertyId, roomId: args.roomId, type: args.type, dueDate: args.dueDate, priority: args.priority ?? 'NORMAL', notes: args.notes ?? '' } });
}

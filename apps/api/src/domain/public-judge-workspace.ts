import type { Prisma, PrismaClient, Role } from '@prisma/client';
import { PUBLIC_JUDGE_DATES } from './public-judge-dates.js';
import { dateOnly } from './dates.js';

export async function publicJudgeWorkspaceMetadata(db: PrismaClient, userId: string, role: Role) {
  if (role === 'LOADER') return PUBLIC_JUDGE_DATES;
  let scope: Prisma.TripStopWhereInput;
  if (role === 'DRIVER') scope = { trip: { driverUserId: userId } };
  else if (role === 'STORE_MANAGER') {
    const assignments = await db.userOutlet.findMany({ where: { userId }, take: 2, select: { outletId: true } });
    if (assignments.length !== 1) return PUBLIC_JUDGE_DATES;
    scope = { order: { outletId: assignments[0].outletId } };
  } else {
    const assignments = await db.userDepot.findMany({ where: { userId }, select: { depotId: true } });
    scope = { trip: { vehicle: { depotId: { in: assignments.map(row => row.depotId) } } } };
  }
  const stop = await db.tripStop.findFirst({ where: { AND: [scope, { active: true,
    order: { outlet: { source: 'SYNTHETIC' } }, trip: { status: 'COMPLETED', serviceDate: dateOnly(PUBLIC_JUDGE_DATES.historyDate), vehicle: { source: 'SYNTHETIC' },
      planningRun: { is: { status: 'RELEASED', releasedAt: { not: null }, supersededAt: null, strategyVersion: { not: null } } } },
    delivery: { is: { receipt: { is: { status: 'CONFIRMED' } }, proof: { is: { AND: [
      { attachments: { some: { kind: 'PHOTO' } } }, { attachments: { some: { kind: 'SIGNATURE' } } }
    ] } } } } }] }, orderBy: { delivery: { completedAt: 'desc' } }, select: { id: true, orderId: true, tripId: true } });
  return { ...PUBLIC_JUDGE_DATES, ...(stop ? { completedExample: { orderId: stop.orderId, tripId: stop.tripId, stopId: stop.id } } : {}) };
}

import { randomUUID } from 'node:crypto';
import { PrismaClient, type TemperatureRequirement } from '@prisma/client';
import { dateOnly, isoWeek } from '../dates.js';
import { importReferenceFiles, REFERENCE_HEADERS, type ReferenceFile, type ReferenceFiles } from '../reference-data.js';

// Independently authored, publication-safe test data. Never part of the installation seed.
export const SYNTHETIC_DATE = '2040-01-02';
const csv = (file: ReferenceFile, rows: (string | number)[][]) => [REFERENCE_HEADERS[file].join(','), ...rows.map(row => row.join(','))].join('\n') + '\n';
export function syntheticReferenceFiles(): ReferenceFiles {
  const calendar = [SYNTHETIC_DATE, '2040-01-03', '2040-01-08'].map(date => {
    const dow = (dateOnly(date).getUTCDay() + 6) % 7, iso = isoWeek(date);
    return [date, dow, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow], Number(dow >= 5), iso.year, iso.week, 0, '', 0, 0, 0, Number(dow !== 6)];
  });
  return {
    'outlets.csv': csv('outlets.csv', [
      ['SYN-FRESH-STREET', 'Fresh', 'Synthetic District', 'Peliyagoda', 'street', 'normal', '', '05:00', '07:00'],
      ['SYN-FRESH-VAN', 'Fresh', 'Synthetic District', 'Peliyagoda', 'street', 'van_only', '', '05:00', '07:00'],
      ['SYN-STYLE-MALL', 'Style', 'Synthetic District', 'Peliyagoda', 'mall_bay', 'mall_dock', '10:00-12:00', '10:00', '12:00'],
      ['SYN-TECH-KANDY', 'Tech', 'Synthetic District', 'Kandy', 'rear_dock', 'normal', '', '09:00', '16:00']
    ]),
    'vehicles.csv': csv('vehicles.csv', [
      ['SYN-REEFER', 'truck', 'reefer', 900, 12, 'diesel', 7, 81, 'Peliyagoda'],
      ['SYN-AMBIENT', 'truck', 'ambient', 1800, 18, 'diesel', 9, 95, 'Peliyagoda'],
      ['SYN-VAN', 'van', 'ambient', 320, 4, 'diesel', 11, 56, 'Kandy']
    ]),
    'calendar.csv': csv('calendar.csv', calendar),
    'district_travel.csv': csv('district_travel.csv', [
      ['Synthetic District', 'Peliyagoda', 'urban', 35, 16, 30, 2, 5],
      ['Synthetic District', 'Kandy', 'hill', 25, 8, 25, 1, 4]
    ]),
    'service_allowance.csv': csv('service_allowance.csv', [['Fresh', 'street', 9], ['Style', 'mall_bay', 18], ['Tech', 'rear_dock', 14]])
  };
}
export async function installSyntheticFixture(db: PrismaClient) {
  await importReferenceFiles(db, syntheticReferenceFiles(), 'SYNTHETIC');
  const [fresh, style, tech, reefer, truck, van, dispatcher, loader, driver, store] = await Promise.all([
    db.outlet.findUniqueOrThrow({ where: { outletRef: 'SYN-FRESH-STREET' } }), db.outlet.findUniqueOrThrow({ where: { outletRef: 'SYN-STYLE-MALL' } }),
    db.outlet.findUniqueOrThrow({ where: { outletRef: 'SYN-TECH-KANDY' } }), db.vehicle.findUniqueOrThrow({ where: { vehicleRef: 'SYN-REEFER' } }),
    db.vehicle.findUniqueOrThrow({ where: { vehicleRef: 'SYN-AMBIENT' } }), db.vehicle.findUniqueOrThrow({ where: { vehicleRef: 'SYN-VAN' } }),
    db.user.findUniqueOrThrow({ where: { email: 'dispatcher@waypoint.local' } }), db.user.findUniqueOrThrow({ where: { email: 'loader@waypoint.local' } }),
    db.user.findUniqueOrThrow({ where: { email: 'driver@waypoint.local' } }), db.user.findUniqueOrThrow({ where: { email: 'store@waypoint.local' } })
  ]);
  for (const user of [dispatcher, loader]) await db.userDepot.create({ data: { userId: user.id, depotId: fresh.depotId } });
  await db.userOutlet.create({ data: { userId: store.id, outletId: fresh.id } });
  const trip = await db.trip.create({ data: { tripRef: `SYN-TRIP-${randomUUID()}`, vehicleId: reefer.id, serviceDate: dateOnly(SYNTHETIC_DATE), tripNumber: 1, status: 'RELEASED', driverUserId: driver.id } });
  const otherTrip = await db.trip.create({ data: { tripRef: `SYN-TRIP-${randomUUID()}`, vehicleId: van.id, serviceDate: dateOnly(SYNTHETIC_DATE), tripNumber: 1, status: 'RELEASED' } });
  return { fresh, style, tech, reefer, truck, van, dispatcher, loader, driver, store, trip, otherTrip };
}
export async function syntheticOrder(db: PrismaClient, outletId: string, temperatureRequirement: TemperatureRequirement = 'CHILLED') {
  return db.order.create({ data: { orderRef: `SYN-ORDER-${randomUUID()}`, outletId, requestedDeliveryDate: dateOnly(SYNTHETIC_DATE),
    temperatureRequirement, orderedUnits: 73, orderedWeightKg: '41.250', orderedVolumeM3: '0.750' } });
}

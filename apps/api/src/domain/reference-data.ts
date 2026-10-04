import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { Prisma, type PrismaClient, type ReferenceSource } from '@prisma/client';
import { appendAudit } from './audit.js';
import { dateOnly, dateSchema, isoWeek } from './dates.js';
import { DomainError, requireDomain } from './errors.js';

export const REFERENCE_HEADERS = {
  'outlets.csv': ['outlet_id', 'brand', 'district', 'depot', 'dock_type', 'parking_constraint', 'mall_window', 'window_open_time', 'window_close_time'],
  'vehicles.csv': ['vehicle_id', 'type', 'temp', 'weight_cap_kg', 'volume_cap_m3', 'fuel_type', 'km_per_l', 'weekly_fuel_quota_l', 'depot'],
  'calendar.csv': ['date', 'dow', 'dow_name', 'is_weekend', 'iso_year', 'iso_week', 'is_payday', 'festival', 'festival_ramp', 'is_holiday', 'monsoon', 'is_operating'],
  'district_travel.csv': ['district', 'depot', 'road_class', 'free_flow_kmh', 'depot_to_district_km', 'depot_to_district_freeflow_min', 'inter_stop_km', 'inter_stop_freeflow_min'],
  'service_allowance.csv': ['brand', 'dock_type', 'service_allowance_min']
} as const;
export type ReferenceFile = keyof typeof REFERENCE_HEADERS;
export type ReferenceFiles = Record<ReferenceFile, string>;
const text = z.string().trim().min(1).max(80);
const decimal = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/).transform(Number).pipe(z.number().finite().max(999999999.999));
const positive = decimal.refine(value => value > 0, 'Must be greater than zero.');
const integer = z.string().regex(/^(?:0|[1-9]\d*)$/).transform(Number).pipe(z.number().int().max(2147483647));
const flag = z.enum(['0', '1']).transform(value => value === '1');
const brand = z.enum(['Fresh', 'Style', 'Tech']).transform(value => ({ Fresh: 'FRESH', Style: 'STYLE', Tech: 'TECH' } as const)[value]);
const dock = z.enum(['street', 'rear_dock', 'mall_bay']).transform(value => ({ street: 'STREET', rear_dock: 'REAR_DOCK', mall_bay: 'MALL_BAY' } as const)[value]);
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).transform(value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)));
const mallWindow = z.string().transform((value, ctx) => {
  if (!value) return { mallWindowOpen: null, mallWindowClose: null };
  const pair = value.split('-');
  const open = clock.safeParse(pair[0]), close = clock.safeParse(pair[1]);
  if (pair.length !== 2 || !open.success || !close.success || open.data >= close.data) {
    ctx.addIssue({ code: 'custom', message: 'Use an increasing HH:mm-HH:mm mall window.' }); return z.NEVER;
  }
  return { mallWindowOpen: open.data, mallWindowClose: close.data };
});
const outletSchema = z.object({ outlet_id: text, brand, district: text, depot: text, dock_type: dock,
  parking_constraint: z.enum(['normal', 'van_only', 'mall_dock']).transform(value => ({ normal: 'NORMAL', van_only: 'VAN_ONLY', mall_dock: 'MALL_DOCK' } as const)[value]),
  mall_window: mallWindow, window_open_time: clock, window_close_time: clock
}).superRefine((row, ctx) => {
  if (row.window_open_time >= row.window_close_time) ctx.addIssue({ code: 'custom', path: ['window_close_time'], message: 'Window must close after opening.' });
  if (row.parking_constraint === 'MALL_DOCK' && row.mall_window.mallWindowOpen === null) ctx.addIssue({ code: 'custom', path: ['mall_window'], message: 'Mall access requires its source window.' });
});
const vehicleSchema = z.object({ vehicle_id: text,
  type: z.enum(['truck', 'van']).transform(value => value === 'truck' ? 'TRUCK' as const : 'VAN' as const),
  temp: z.enum(['ambient', 'reefer']).transform(value => value === 'ambient' ? 'AMBIENT' as const : 'REEFER' as const),
  weight_cap_kg: positive, volume_cap_m3: positive, fuel_type: z.enum(['diesel', 'petrol']).transform(value => value === 'diesel' ? 'DIESEL' as const : 'PETROL' as const),
  km_per_l: positive, weekly_fuel_quota_l: positive, depot: text
});
const calendarSchema = z.object({ date: dateSchema, dow: integer, dow_name: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  is_weekend: flag, iso_year: integer, iso_week: integer, is_payday: flag, festival: z.string().max(80),
  festival_ramp: decimal.refine(value => value <= 1), is_holiday: flag, monsoon: flag, is_operating: flag
}).superRefine((row, ctx) => {
  if (!dateSchema.safeParse(row.date).success) return;
  const weekday = (dateOnly(row.date).getUTCDay() + 6) % 7;
  const iso = isoWeek(row.date);
  if (row.dow !== weekday || row.dow_name !== ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekday] || row.iso_year !== iso.year || row.iso_week !== iso.week) {
    ctx.addIssue({ code: 'custom', path: ['date'], message: 'Calendar weekday/ISO context contradicts its date.' });
  }
});
const travelSchema = z.object({ district: text, depot: text,
  road_class: z.enum(['urban', 'suburban', 'highway', 'hill']).transform(value => ({ urban: 'URBAN', suburban: 'SUBURBAN', highway: 'HIGHWAY', hill: 'HILL' } as const)[value]),
  free_flow_kmh: positive, depot_to_district_km: decimal, depot_to_district_freeflow_min: decimal, inter_stop_km: decimal, inter_stop_freeflow_min: decimal });
const allowanceSchema = z.object({ brand, dock_type: dock, service_allowance_min: positive });

function readRows<T>(file: ReferenceFile, content: string, schema: z.ZodType<T>): T[] {
  requireDomain(Buffer.byteLength(content) <= 5_000_000, `${file}: file exceeds the reference import size limit.`);
  let rows: Record<string, string>[];
  try {
    rows = parse(content, { bom: true, trim: true, skip_empty_lines: true, max_record_size: 5000,
      columns: (headers: string[]) => {
        const expected: readonly string[] = REFERENCE_HEADERS[file];
        requireDomain(headers.length === expected.length && new Set(headers).size === headers.length && headers.every(value => expected.includes(value)), `${file}: headers must match the documented source profile.`);
        return headers;
      }
    }) as Record<string, string>[];
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('INVALID_DOMAIN', `${file}: malformed CSV; check quoting and column counts.`);
  }
  requireDomain(rows.length > 0 && rows.length <= 100000, `${file}: expected a nonempty bounded reference file.`);
  return rows.map((row, index) => {
    const result = schema.safeParse(row);
    if (!result.success) throw new DomainError('INVALID_DOMAIN', `${file}: row ${index + 2}; invalid ${[...new Set(result.error.issues.map(issue => issue.path.join('.') || 'row'))].join(', ')}.`);
    return result.data;
  });
}
function unique<T>(rows: T[], key: (row: T) => string, file: string) {
  requireDomain(new Set(rows.map(key)).size === rows.length, `${file}: duplicate identifier/key.`);
}
export function validateReferenceFiles(files: ReferenceFiles) {
  for (const file of Object.keys(REFERENCE_HEADERS) as ReferenceFile[]) requireDomain(typeof files[file] === 'string', `Missing required source file: ${file}.`);
  const outlets = readRows('outlets.csv', files['outlets.csv'], outletSchema);
  const vehicles = readRows('vehicles.csv', files['vehicles.csv'], vehicleSchema);
  const calendar = readRows('calendar.csv', files['calendar.csv'], calendarSchema);
  const travel = readRows('district_travel.csv', files['district_travel.csv'], travelSchema);
  const allowances = readRows('service_allowance.csv', files['service_allowance.csv'], allowanceSchema);
  unique(outlets, row => row.outlet_id, 'outlets.csv'); unique(vehicles, row => row.vehicle_id, 'vehicles.csv');
  unique(calendar, row => row.date, 'calendar.csv'); unique(travel, row => `${row.depot}\0${row.district}`, 'district_travel.csv');
  unique(allowances, row => `${row.brand}\0${row.dock_type}`, 'service_allowance.csv');
  const travelKeys = new Set(travel.map(row => `${row.depot}\0${row.district}`));
  const serviceKeys = new Set(allowances.map(row => `${row.brand}\0${row.dock_type}`));
  const depots = new Set(travel.map(row => row.depot));
  requireDomain(outlets.every(row => travelKeys.has(`${row.depot}\0${row.district}`)), 'outlets.csv: missing depot/district travel reference.');
  requireDomain(outlets.every(row => serviceKeys.has(`${row.brand}\0${row.dock_type}`)), 'outlets.csv: missing brand/dock service allowance.');
  requireDomain(vehicles.every(row => depots.has(row.depot)), 'vehicles.csv: unknown depot reference.');
  return { outlets, vehicles, calendar, travel, allowances, depots: [...depots] };
}

export async function importReferenceFiles(prisma: PrismaClient, files: ReferenceFiles, source: ReferenceSource) {
  requireDomain(source === 'OFFICIAL' || source === 'SYNTHETIC', 'Specify official or synthetic source provenance.');
  const data = validateReferenceFiles(files);
  const names = Object.keys(REFERENCE_HEADERS) as ReferenceFile[];
  const fileDigests = Object.fromEntries(names.map(name => [name, createHash('sha256').update(files[name]).digest('hex')]));
  const digest = createHash('sha256').update(JSON.stringify({ source, fileDigests })).digest('hex');
  const counts = { outlets: data.outlets.length, vehicles: data.vehicles.length, calendar: data.calendar.length, travel: data.travel.length, allowances: data.allowances.length };
  try {
    return await prisma.$transaction(async tx => {
      const previous = await tx.referenceImport.findUnique({ where: { digest } });
      if (previous) return { id: previous.id, counts, source, repeated: true };
      const batch = await tx.referenceImport.create({ data: { digest, source, fileDigests, counts } });
      const depotIds = new Map<string, string>();
      for (const name of data.depots) {
        const depot = await tx.depot.upsert({ where: { name }, create: { name }, update: {} });
        depotIds.set(name, depot.id);
      }
      const provenance = { source, importId: batch.id };
      await tx.outlet.createMany({ data: data.outlets.map(row => ({ outletRef: row.outlet_id, brand: row.brand, district: row.district,
        depotId: depotIds.get(row.depot)!, dockType: row.dock_type, accessConstraint: row.parking_constraint, ...row.mall_window,
        deliveryWindowOpen: row.window_open_time, deliveryWindowClose: row.window_close_time, ...provenance })) });
      await tx.vehicle.createMany({ data: data.vehicles.map(row => ({ vehicleRef: row.vehicle_id, type: row.type,
        temperatureCapability: row.temp, weightCapacityKg: row.weight_cap_kg, volumeCapacityM3: row.volume_cap_m3,
        fuelType: row.fuel_type, kmPerLitre: row.km_per_l, weeklyFuelQuotaLitres: row.weekly_fuel_quota_l,
        depotId: depotIds.get(row.depot)!, ...provenance })) });
      await tx.calendarDay.createMany({ data: data.calendar.map(row => ({ date: dateOnly(row.date), operatingDay: row.is_operating,
        dayOfWeek: row.dow, dayName: row.dow_name, weekend: row.is_weekend, isoYear: row.iso_year, isoWeek: row.iso_week,
        payday: row.is_payday, festival: row.festival || null, festivalRamp: row.festival_ramp, holiday: row.is_holiday, monsoon: row.monsoon, ...provenance })) });
      await tx.districtTravel.createMany({ data: data.travel.map(row => ({ depotId: depotIds.get(row.depot)!, district: row.district,
        roadClass: row.road_class, freeFlowKmh: row.free_flow_kmh, depotDistanceKm: row.depot_to_district_km,
        depotMinutes: row.depot_to_district_freeflow_min, interStopKm: row.inter_stop_km, interStopMinutes: row.inter_stop_freeflow_min, ...provenance })) });
      await tx.serviceAllowance.createMany({ data: data.allowances.map(row => ({ brand: row.brand, dockType: row.dock_type, serviceMinutes: row.service_allowance_min, ...provenance })) });
      await appendAudit(tx, { actor: null, eventType: 'REFERENCE_DATA_IMPORTED', entityType: 'IMPORT_BATCH', entityId: batch.id, metadata: { source, counts } });
      return { id: batch.id, counts, source, repeated: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) throw new DomainError('DOMAIN_CONFLICT', 'Reference import rolled back: existing identifiers, concurrent import or database constraints conflict. No rows were partially imported.');
    throw error;
  }
}

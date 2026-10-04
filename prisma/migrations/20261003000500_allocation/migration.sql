BEGIN;
ALTER TYPE "PlanningStatus" ADD VALUE 'SUPERSEDED';
ALTER TYPE "AuditEventType" ADD VALUE 'PLAN_VALIDATED';
ALTER TYPE "AuditEntityType" ADD VALUE 'PLANNING_RUN';
CREATE TYPE "VehicleAvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

ALTER TABLE "PlanningRun"
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "revision" INTEGER,
  ADD COLUMN "strategyVersion" VARCHAR(80),
  ADD COLUMN "generatedAt" TIMESTAMPTZ(3),
  ADD COLUMN "supersededAt" TIMESTAMPTZ(3),
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "snapshotHash" VARCHAR(64),
  ADD COLUMN "orderVersions" JSONB,
  ADD COLUMN "summary" JSONB,
  ADD COLUMN "validation" JSONB,
  ADD COLUMN "validatedSnapshotHash" VARCHAR(64),
  ADD CONSTRAINT "PlanningRun_version_check" CHECK ("version" > 0 AND ("revision" IS NULL OR "revision" > 0));
CREATE UNIQUE INDEX "PlanningRun_serviceDate_depotId_revision_key" ON "PlanningRun"("serviceDate", "depotId", "revision");
CREATE UNIQUE INDEX "PlanningRun_one_unreleased_generated_idx" ON "PlanningRun"("serviceDate", "depotId")
  WHERE "strategyVersion" IS NOT NULL AND "status" IN ('DRAFT', 'VALIDATED') AND "supersededAt" IS NULL;

CREATE TABLE "VehicleAvailability" (
  "id" UUID NOT NULL PRIMARY KEY,
  "vehicleId" UUID NOT NULL REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "serviceDate" DATE NOT NULL REFERENCES "CalendarDay"("date") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "VehicleAvailabilityStatus" NOT NULL,
  "availableFromMinute" INTEGER,
  "availableUntilMinute" INTEGER,
  "source" "ReferenceSource" NOT NULL,
  "note" VARCHAR(500),
  "createdByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "VehicleAvailability_window_check" CHECK (
    ("availableFromMinute" IS NULL OR "availableFromMinute" BETWEEN 0 AND 1439)
    AND ("availableUntilMinute" IS NULL OR "availableUntilMinute" BETWEEN 1 AND 1440)
    AND ("availableFromMinute" IS NULL OR "availableUntilMinute" IS NULL OR "availableFromMinute" < "availableUntilMinute")
    AND ("status" <> 'AVAILABLE' OR ("availableFromMinute" IS NOT NULL AND "availableUntilMinute" IS NOT NULL)))
);
CREATE UNIQUE INDEX "VehicleAvailability_vehicleId_serviceDate_key" ON "VehicleAvailability"("vehicleId", "serviceDate");
CREATE INDEX "VehicleAvailability_serviceDate_status_idx" ON "VehicleAvailability"("serviceDate", "status");

ALTER TABLE "Trip" ADD COLUMN "estimatedFuelLitres" DECIMAL(12,3), ADD COLUMN "planningRunId" UUID,
  ADD CONSTRAINT "Trip_planningRunId_fkey" FOREIGN KEY ("planningRunId") REFERENCES "PlanningRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Trip_estimatedFuel_check" CHECK ("estimatedFuelLitres" IS NULL OR "estimatedFuelLitres" >= 0);
DROP INDEX "Trip_vehicleId_serviceDate_tripNumber_key";
CREATE INDEX "Trip_vehicleId_serviceDate_tripNumber_idx" ON "Trip"("vehicleId", "serviceDate", "tripNumber");
CREATE UNIQUE INDEX "Trip_active_vehicle_date_number_key" ON "Trip"("vehicleId", "serviceDate", "tripNumber") WHERE "status" <> 'CANCELLED';
CREATE INDEX "Trip_planningRunId_idx" ON "Trip"("planningRunId");

ALTER TABLE "TripStop" ADD COLUMN "plannedServiceStart" TIMESTAMPTZ(3), ADD COLUMN "plannedServiceComplete" TIMESTAMPTZ(3), ADD COLUMN "plannedWaitingMinutes" DECIMAL(10,3),
  ADD CONSTRAINT "TripStop_planned_service_check" CHECK (("plannedWaitingMinutes" IS NULL OR "plannedWaitingMinutes" >= 0)
    AND ("plannedServiceStart" IS NULL OR "plannedArrival" IS NULL OR "plannedServiceStart" >= "plannedArrival")
    AND ("plannedServiceComplete" IS NULL OR "plannedServiceStart" IS NULL OR "plannedServiceComplete" >= "plannedServiceStart"));

CREATE FUNCTION waypoint_generated_trip_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan "PlanningRun"; vehicle_depot UUID;
BEGIN
  IF NEW."planningRunId" IS NOT NULL THEN
    SELECT * INTO plan FROM "PlanningRun" WHERE "id" = NEW."planningRunId";
    SELECT "depotId" INTO vehicle_depot FROM "Vehicle" WHERE "id" = NEW."vehicleId";
    IF plan."strategyVersion" IS NULL OR plan."serviceDate" <> NEW."serviceDate" OR plan."depotId" <> vehicle_depot THEN
      RAISE EXCEPTION 'Generated trip must match its generated run date and depot' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Trip_generated_plan_guard" BEFORE INSERT OR UPDATE ON "Trip" FOR EACH ROW EXECUTE FUNCTION waypoint_generated_trip_guard();
COMMIT;

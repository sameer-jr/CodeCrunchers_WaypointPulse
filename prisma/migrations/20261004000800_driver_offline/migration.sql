ALTER TYPE "AuditEventType" ADD VALUE 'STOP_ARRIVED';
ALTER TYPE "AuditEventType" ADD VALUE 'TRIP_COMPLETED';
ALTER TYPE "AuditEventType" ADD VALUE 'TRIP_DRIVER_ASSIGNED';
ALTER TABLE "Trip" ADD COLUMN "completedAt" TIMESTAMPTZ(3);
ALTER TABLE "TripStop" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "arrivalClientEventAt" TIMESTAMPTZ(3), ADD COLUMN "arrivalOperationCreatedAt" TIMESTAMPTZ(3);
ALTER TABLE "TripStop" ADD CONSTRAINT "Driver_stop_version" CHECK ("version" > 0);
ALTER TABLE "DeliveryRecord" ADD COLUMN "reasonCode" VARCHAR(40),
  ADD COLUMN "clientEventAt" TIMESTAMPTZ(3), ADD COLUMN "operationCreatedAt" TIMESTAMPTZ(3);
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "Driver_delivery_reason" CHECK (
  "reasonCode" IS NULL OR "reasonCode" IN ('CUSTOMER_UNAVAILABLE','OUTLET_CLOSED','DAMAGED_IN_TRANSIT','QUANTITY_REJECTED','ACCESS_BLOCKED','OTHER'));
CREATE TYPE "OfflineOperationStatus" AS ENUM ('SYNCED','FAILED','CONFLICT');
CREATE TABLE "OfflineOperation" (
  "operationId" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "entityType" VARCHAR(20) NOT NULL CHECK ("entityType" IN ('TRIP','TRIP_STOP')), "entityId" UUID NOT NULL,
  "action" VARCHAR(30) NOT NULL CHECK ("action" IN ('START_TRIP','ARRIVAL','COMPLETE_DELIVERY','FINISH_TRIP')),
  "payload" JSONB NOT NULL, "payloadHash" VARCHAR(64) NOT NULL, "baseVersion" INTEGER NOT NULL CHECK ("baseVersion" > 0), "recordedOffline" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL, "clientEventAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "status" "OfflineOperationStatus" NOT NULL, "result" JSONB NOT NULL
);
CREATE INDEX "OfflineOperation_userId_status_receivedAt_idx" ON "OfflineOperation"("userId","status","receivedAt");
CREATE FUNCTION waypoint_offline_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Offline operation evidence cannot be erased'; END IF;
  IF OLD.status IN ('SYNCED','CONFLICT') OR ROW(NEW."operationId",NEW."userId",NEW."entityType",NEW."entityId",NEW.action,NEW.payload,NEW."payloadHash",NEW."baseVersion",NEW."createdAt",NEW."clientEventAt",NEW."recordedOffline")
    IS DISTINCT FROM ROW(OLD."operationId",OLD."userId",OLD."entityType",OLD."entityId",OLD.action,OLD.payload,OLD."payloadHash",OLD."baseVersion",OLD."createdAt",OLD."clientEventAt",OLD."recordedOffline") THEN
    RAISE EXCEPTION 'Committed offline operation identity and results are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "OfflineOperation_history" BEFORE UPDATE OR DELETE ON "OfflineOperation" FOR EACH ROW EXECUTE FUNCTION waypoint_offline_history();

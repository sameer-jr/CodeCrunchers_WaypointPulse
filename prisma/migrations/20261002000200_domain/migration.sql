BEGIN;
-- CreateEnum
CREATE TYPE "ReferenceSource" AS ENUM ('OFFICIAL', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "Brand" AS ENUM ('FRESH', 'STYLE', 'TECH');

-- CreateEnum
CREATE TYPE "DockType" AS ENUM ('STREET', 'REAR_DOCK', 'MALL_BAY');

-- CreateEnum
CREATE TYPE "AccessConstraint" AS ENUM ('NORMAL', 'VAN_ONLY', 'MALL_DOCK');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRUCK', 'VAN');

-- CreateEnum
CREATE TYPE "TemperatureCapability" AS ENUM ('AMBIENT', 'REEFER');

-- CreateEnum
CREATE TYPE "TemperatureRequirement" AS ENUM ('AMBIENT', 'CHILLED', 'FROZEN');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'PETROL');

-- CreateEnum
CREATE TYPE "RoadClass" AS ENUM ('URBAN', 'SUBURBAN', 'HIGHWAY', 'HILL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CLOSED_FOR_PLANNING', 'PLANNED', 'DEFERRED', 'RELEASED_TO_LOADING', 'LOADING', 'LOADING_EXCEPTION', 'READY_FOR_DISPATCH', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'DELIVERY_FAILED', 'AWAITING_RECEIPT', 'RECEIPT_CONFIRMED', 'RECEIPT_ISSUE');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PLANNED', 'RELEASED', 'LOADING', 'READY_FOR_DISPATCH', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PLANNED', 'ARRIVED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanningStatus" AS ENUM ('DRAFT', 'VALIDATED', 'RELEASED');

-- CreateEnum
CREATE TYPE "AllocationDecision" AS ENUM ('ASSIGNED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "LoadStatus" AS ENUM ('PENDING', 'LOADING', 'COMPLETE', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('CONFIRMED', 'ISSUE_REPORTED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('LOADING_SHORTFALL', 'DAMAGED_GOODS', 'DELIVERY_PARTIAL', 'DELIVERY_FAILED', 'RECEIPT_DISCREPANCY', 'SYNC_CONFLICT');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DeferralReason" AS ENUM ('NO_FEASIBLE_ASSIGNMENT', 'CAPACITY', 'TEMPERATURE', 'ACCESS', 'DELIVERY_WINDOW', 'NON_OPERATING_DAY', 'FUEL_UNKNOWN', 'FUEL_QUOTA', 'DELIVERY_RETRY');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_STATE_CHANGED', 'PLAN_GENERATED', 'ORDER_ALLOCATED', 'ORDER_DEFERRED', 'PLAN_RELEASED', 'LOADING_STARTED', 'LOADING_SHORTFALL_REPORTED', 'MANIFEST_REVISED', 'READY_FOR_DISPATCH', 'TRIP_STARTED', 'STOP_COMPLETED', 'DELIVERY_PARTIAL', 'DELIVERY_FAILED', 'OFFLINE_ACTION_SYNCED', 'RECEIPT_CONFIRMED', 'RECEIPT_ISSUE_REPORTED', 'REFERENCE_DATA_IMPORTED');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('ORDER', 'TRIP', 'LOAD_RECORD', 'DELIVERY_RECORD', 'RECEIPT', 'IMPORT_BATCH', 'FUEL_LEDGER');

-- CreateEnum
CREATE TYPE "FuelUsageKind" AS ENUM ('CONSUMED', 'RESERVED');

-- CreateEnum
CREATE TYPE "FuelUsageStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "ReferenceImport" (
    "id" UUID NOT NULL,
    "source" "ReferenceSource" NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "fileDigests" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depot" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outlet" (
    "id" UUID NOT NULL,
    "outletRef" VARCHAR(80) NOT NULL,
    "brand" "Brand" NOT NULL,
    "district" VARCHAR(80) NOT NULL,
    "depotId" UUID NOT NULL,
    "dockType" "DockType" NOT NULL,
    "accessConstraint" "AccessConstraint" NOT NULL,
    "mallWindowOpen" INTEGER,
    "mallWindowClose" INTEGER,
    "deliveryWindowOpen" INTEGER NOT NULL,
    "deliveryWindowClose" INTEGER NOT NULL,
    "source" "ReferenceSource" NOT NULL,
    "importId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "vehicleRef" VARCHAR(80) NOT NULL,
    "type" "VehicleType" NOT NULL,
    "temperatureCapability" "TemperatureCapability" NOT NULL,
    "weightCapacityKg" DECIMAL(12,3) NOT NULL,
    "volumeCapacityM3" DECIMAL(12,3) NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "kmPerLitre" DECIMAL(10,3) NOT NULL,
    "weeklyFuelQuotaLitres" DECIMAL(12,3) NOT NULL,
    "depotId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "ReferenceSource" NOT NULL,
    "importId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarDay" (
    "date" DATE NOT NULL,
    "operatingDay" BOOLEAN NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "dayName" VARCHAR(3) NOT NULL,
    "weekend" BOOLEAN NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "payday" BOOLEAN NOT NULL,
    "festival" VARCHAR(80),
    "festivalRamp" DECIMAL(4,3) NOT NULL,
    "holiday" BOOLEAN NOT NULL,
    "monsoon" BOOLEAN NOT NULL,
    "source" "ReferenceSource" NOT NULL,
    "importId" UUID,

    CONSTRAINT "CalendarDay_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "DistrictTravel" (
    "id" UUID NOT NULL,
    "depotId" UUID NOT NULL,
    "district" VARCHAR(80) NOT NULL,
    "roadClass" "RoadClass" NOT NULL,
    "freeFlowKmh" DECIMAL(10,3) NOT NULL,
    "depotDistanceKm" DECIMAL(12,3) NOT NULL,
    "depotMinutes" DECIMAL(12,3) NOT NULL,
    "interStopKm" DECIMAL(12,3) NOT NULL,
    "interStopMinutes" DECIMAL(12,3) NOT NULL,
    "source" "ReferenceSource" NOT NULL,
    "importId" UUID,

    CONSTRAINT "DistrictTravel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAllowance" (
    "id" UUID NOT NULL,
    "brand" "Brand" NOT NULL,
    "dockType" "DockType" NOT NULL,
    "serviceMinutes" DECIMAL(10,3) NOT NULL,
    "source" "ReferenceSource" NOT NULL,
    "importId" UUID,

    CONSTRAINT "ServiceAllowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOutlet" (
    "userId" UUID NOT NULL,
    "outletId" UUID NOT NULL,

    CONSTRAINT "UserOutlet_pkey" PRIMARY KEY ("userId","outletId")
);

-- CreateTable
CREATE TABLE "UserDepot" (
    "userId" UUID NOT NULL,
    "depotId" UUID NOT NULL,

    CONSTRAINT "UserDepot_pkey" PRIMARY KEY ("userId","depotId")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderRef" VARCHAR(80) NOT NULL,
    "outletId" UUID NOT NULL,
    "requestedDeliveryDate" DATE NOT NULL,
    "temperatureRequirement" "TemperatureRequirement" NOT NULL,
    "orderedUnits" INTEGER NOT NULL,
    "orderedWeightKg" DECIMAL(12,3) NOT NULL,
    "orderedVolumeM3" DECIMAL(12,3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningRun" (
    "id" UUID NOT NULL,
    "planningRef" VARCHAR(80) NOT NULL,
    "serviceDate" DATE NOT NULL,
    "depotId" UUID NOT NULL,
    "status" "PlanningStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PlanningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "tripRef" VARCHAR(80) NOT NULL,
    "serviceDate" DATE NOT NULL,
    "vehicleId" UUID NOT NULL,
    "tripNumber" INTEGER NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "driverUserId" UUID,
    "plannedDeparture" TIMESTAMPTZ(3),
    "actualDeparture" TIMESTAMPTZ(3),
    "plannedReturn" TIMESTAMPTZ(3),
    "actualReturn" TIMESTAMPTZ(3),
    "estimatedDistanceKm" DECIMAL(12,3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStop" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "plannedArrival" TIMESTAMPTZ(3),
    "actualArrival" TIMESTAMPTZ(3),
    "plannedServiceMinutes" DECIMAL(10,3),
    "actualServiceMinutes" DECIMAL(10,3),
    "status" "StopStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "planningRunId" UUID NOT NULL,
    "tripStopId" UUID,
    "decision" "AllocationDecision" NOT NULL,
    "allocatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkMetadata" JSONB,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadRecord" (
    "id" UUID NOT NULL,
    "tripStopId" UUID NOT NULL,
    "expectedUnits" INTEGER NOT NULL,
    "loadedUnits" INTEGER,
    "status" "LoadStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "recordedByUserId" UUID,
    "recordedAt" TIMESTAMPTZ(3),
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoadRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRecord" (
    "id" UUID NOT NULL,
    "tripStopId" UUID NOT NULL,
    "loadRecordId" UUID NOT NULL,
    "outcome" "DeliveryOutcome" NOT NULL,
    "expectedLoadedUnits" INTEGER NOT NULL,
    "deliveredUnits" INTEGER NOT NULL,
    "driverNote" VARCHAR(1000),
    "arrivedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedByDriverId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" UUID NOT NULL,
    "deliveryRecordId" UUID NOT NULL,
    "recipientName" VARCHAR(120),
    "recipientRole" VARCHAR(80),
    "photoStorageKey" VARCHAR(500),
    "signatureStorageKey" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "deliveryRecordId" UUID NOT NULL,
    "receivedUnits" INTEGER NOT NULL,
    "status" "ReceiptStatus" NOT NULL,
    "confirmedByUserId" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL,
    "issueNote" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" UUID NOT NULL,
    "orderId" UUID,
    "tripId" UUID,
    "loadRecordId" UUID,
    "deliveryRecordId" UUID,
    "receiptId" UUID,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "message" VARCHAR(1000) NOT NULL,
    "createdByUserId" UUID,
    "assignedUserId" UUID,
    "reviewedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeferralRecord" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "planningRunId" UUID,
    "reasonCode" "DeferralReason" NOT NULL,
    "reasonDetail" VARCHAR(1000) NOT NULL,
    "deferredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deferredByUserId" UUID,
    "nextEligibleDate" DATE,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DeferralRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorRole" "Role",
    "eventType" "AuditEventType" NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelLedger" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "openingConsumedLitres" DECIMAL(12,3),
    "openingSource" "ReferenceSource",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelUsage" (
    "id" UUID NOT NULL,
    "ledgerId" UUID NOT NULL,
    "tripId" UUID,
    "kind" "FuelUsageKind" NOT NULL,
    "status" "FuelUsageStatus" NOT NULL DEFAULT 'ACTIVE',
    "litres" DECIMAL(12,3) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "source" "ReferenceSource" NOT NULL,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceImport_digest_key" ON "ReferenceImport"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "Depot_name_key" ON "Depot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Outlet_outletRef_key" ON "Outlet"("outletRef");

-- CreateIndex
CREATE INDEX "Outlet_depotId_district_idx" ON "Outlet"("depotId", "district");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleRef_key" ON "Vehicle"("vehicleRef");

-- CreateIndex
CREATE INDEX "Vehicle_depotId_active_idx" ON "Vehicle"("depotId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DistrictTravel_depotId_district_key" ON "DistrictTravel"("depotId", "district");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAllowance_brand_dockType_key" ON "ServiceAllowance"("brand", "dockType");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderRef_key" ON "Order"("orderRef");

-- CreateIndex
CREATE INDEX "Order_requestedDeliveryDate_status_idx" ON "Order"("requestedDeliveryDate", "status");

-- CreateIndex
CREATE INDEX "Order_outletId_status_idx" ON "Order"("outletId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningRun_planningRef_key" ON "PlanningRun"("planningRef");

-- CreateIndex
CREATE INDEX "PlanningRun_serviceDate_depotId_idx" ON "PlanningRun"("serviceDate", "depotId");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_tripRef_key" ON "Trip"("tripRef");

-- CreateIndex
CREATE INDEX "Trip_driverUserId_serviceDate_idx" ON "Trip"("driverUserId", "serviceDate");

-- CreateIndex
CREATE INDEX "Trip_serviceDate_status_idx" ON "Trip"("serviceDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_vehicleId_serviceDate_tripNumber_key" ON "Trip"("vehicleId", "serviceDate", "tripNumber");

-- CreateIndex
CREATE INDEX "TripStop_orderId_idx" ON "TripStop"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_tripId_sequence_key" ON "TripStop"("tripId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "TripStop_id_orderId_key" ON "TripStop"("id", "orderId");

-- CreateIndex
CREATE INDEX "Allocation_tripStopId_idx" ON "Allocation"("tripStopId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_planningRunId_orderId_key" ON "Allocation"("planningRunId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadRecord_tripStopId_key" ON "LoadRecord"("tripStopId");

-- CreateIndex
CREATE UNIQUE INDEX "LoadRecord_id_tripStopId_key" ON "LoadRecord"("id", "tripStopId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRecord_tripStopId_key" ON "DeliveryRecord"("tripStopId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRecord_loadRecordId_key" ON "DeliveryRecord"("loadRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRecord_loadRecordId_tripStopId_key" ON "DeliveryRecord"("loadRecordId", "tripStopId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProof_deliveryRecordId_key" ON "DeliveryProof"("deliveryRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_deliveryRecordId_key" ON "Receipt"("deliveryRecordId");

-- CreateIndex
CREATE INDEX "Exception_status_type_idx" ON "Exception"("status", "type");

-- CreateIndex
CREATE INDEX "Exception_orderId_idx" ON "Exception"("orderId");

-- CreateIndex
CREATE INDEX "Exception_tripId_idx" ON "Exception"("tripId");

-- CreateIndex
CREATE INDEX "DeferralRecord_orderId_deferredAt_idx" ON "DeferralRecord"("orderId", "deferredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeferralRecord_orderId_planningRunId_key" ON "DeferralRecord"("orderId", "planningRunId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_timestamp_idx" ON "AuditEvent"("entityType", "entityId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelLedger_vehicleId_weekStart_key" ON "FuelLedger"("vehicleId", "weekStart");

-- CreateIndex
CREATE INDEX "FuelUsage_ledgerId_kind_status_idx" ON "FuelUsage"("ledgerId", "kind", "status");

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReferenceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReferenceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarDay" ADD CONSTRAINT "CalendarDay_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReferenceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistrictTravel" ADD CONSTRAINT "DistrictTravel_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistrictTravel" ADD CONSTRAINT "DistrictTravel_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReferenceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAllowance" ADD CONSTRAINT "ServiceAllowance_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ReferenceImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutlet" ADD CONSTRAINT "UserOutlet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOutlet" ADD CONSTRAINT "UserOutlet_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepot" ADD CONSTRAINT "UserDepot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepot" ADD CONSTRAINT "UserDepot_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_requestedDeliveryDate_fkey" FOREIGN KEY ("requestedDeliveryDate") REFERENCES "CalendarDay"("date") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRun" ADD CONSTRAINT "PlanningRun_serviceDate_fkey" FOREIGN KEY ("serviceDate") REFERENCES "CalendarDay"("date") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRun" ADD CONSTRAINT "PlanningRun_depotId_fkey" FOREIGN KEY ("depotId") REFERENCES "Depot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningRun" ADD CONSTRAINT "PlanningRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_serviceDate_fkey" FOREIGN KEY ("serviceDate") REFERENCES "CalendarDay"("date") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_planningRunId_fkey" FOREIGN KEY ("planningRunId") REFERENCES "PlanningRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_tripStopId_orderId_fkey" FOREIGN KEY ("tripStopId", "orderId") REFERENCES "TripStop"("id", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadRecord" ADD CONSTRAINT "LoadRecord_tripStopId_fkey" FOREIGN KEY ("tripStopId") REFERENCES "TripStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadRecord" ADD CONSTRAINT "LoadRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadRecord" ADD CONSTRAINT "LoadRecord_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_tripStopId_fkey" FOREIGN KEY ("tripStopId") REFERENCES "TripStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_loadRecordId_tripStopId_fkey" FOREIGN KEY ("loadRecordId", "tripStopId") REFERENCES "LoadRecord"("id", "tripStopId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_recordedByDriverId_fkey" FOREIGN KEY ("recordedByDriverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_deliveryRecordId_fkey" FOREIGN KEY ("deliveryRecordId") REFERENCES "DeliveryRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_deliveryRecordId_fkey" FOREIGN KEY ("deliveryRecordId") REFERENCES "DeliveryRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_loadRecordId_fkey" FOREIGN KEY ("loadRecordId") REFERENCES "LoadRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_deliveryRecordId_fkey" FOREIGN KEY ("deliveryRecordId") REFERENCES "DeliveryRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferralRecord" ADD CONSTRAINT "DeferralRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferralRecord" ADD CONSTRAINT "DeferralRecord_planningRunId_fkey" FOREIGN KEY ("planningRunId") REFERENCES "PlanningRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferralRecord" ADD CONSTRAINT "DeferralRecord_deferredByUserId_fkey" FOREIGN KEY ("deferredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelLedger" ADD CONSTRAINT "FuelLedger_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelUsage" ADD CONSTRAINT "FuelUsage_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "FuelLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelUsage" ADD CONSTRAINT "FuelUsage_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelUsage" ADD CONSTRAINT "FuelUsage_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

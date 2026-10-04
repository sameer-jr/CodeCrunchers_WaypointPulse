BEGIN;

ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_windows" CHECK (
  "deliveryWindowOpen" BETWEEN 0 AND 1439 AND "deliveryWindowClose" BETWEEN 0 AND 1439
  AND "deliveryWindowOpen" < "deliveryWindowClose"
  AND (("mallWindowOpen" IS NULL AND "mallWindowClose" IS NULL) OR
    ("mallWindowOpen" IS NOT NULL AND "mallWindowClose" IS NOT NULL AND "mallWindowOpen" >= 0
    AND "mallWindowClose" <= 1439 AND "mallWindowOpen" < "mallWindowClose"))
  AND ("accessConstraint" <> 'MALL_DOCK' OR "mallWindowOpen" IS NOT NULL));
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_positive_capacities" CHECK (
  "weightCapacityKg" > 0 AND "volumeCapacityM3" > 0 AND "kmPerLitre" > 0 AND "weeklyFuelQuotaLitres" > 0);
ALTER TABLE "CalendarDay" ADD CONSTRAINT "Calendar_context" CHECK (
  "dayOfWeek" = EXTRACT(ISODOW FROM "date") - 1
  AND "dayName" = (ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])["dayOfWeek" + 1]
  AND "isoYear" = EXTRACT(ISOYEAR FROM "date") AND "isoWeek" = EXTRACT(WEEK FROM "date")
  AND "festivalRamp" BETWEEN 0 AND 1);
ALTER TABLE "DistrictTravel" ADD CONSTRAINT "Travel_positive" CHECK (
  "freeFlowKmh" > 0 AND "depotDistanceKm" >= 0 AND "depotMinutes" >= 0 AND "interStopKm" >= 0 AND "interStopMinutes" >= 0);
ALTER TABLE "ServiceAllowance" ADD CONSTRAINT "Allowance_positive" CHECK ("serviceMinutes" > 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_positive_quantities" CHECK (
  "orderedUnits" > 0 AND "orderedWeightKg" > 0 AND "orderedVolumeM3" > 0 AND "version" > 0);
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_structure" CHECK (
  "tripNumber" IN (1, 2) AND "version" > 0 AND ("estimatedDistanceKm" IS NULL OR "estimatedDistanceKm" >= 0)
  AND ("plannedDeparture" IS NULL OR ("plannedDeparture" AT TIME ZONE 'Asia/Colombo')::date = "serviceDate")
  AND ("plannedReturn" IS NULL OR "plannedDeparture" IS NULL OR "plannedReturn" >= "plannedDeparture")
  AND ("actualReturn" IS NULL OR "actualDeparture" IS NULL OR "actualReturn" >= "actualDeparture"));
ALTER TABLE "TripStop" ADD CONSTRAINT "Stop_positive" CHECK (
  "sequence" > 0 AND ("plannedServiceMinutes" IS NULL OR "plannedServiceMinutes" >= 0)
  AND ("actualServiceMinutes" IS NULL OR "actualServiceMinutes" >= 0));
CREATE UNIQUE INDEX "TripStop_one_active_assignment" ON "TripStop" ("orderId") WHERE "active" = true;
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_decision_link" CHECK (
  ("decision" = 'ASSIGNED' AND "tripStopId" IS NOT NULL) OR ("decision" = 'DEFERRED' AND "tripStopId" IS NULL));
ALTER TABLE "LoadRecord" ADD CONSTRAINT "Load_quantities_review" CHECK (
  "expectedUnits" > 0 AND "revision" > 0 AND ("loadedUnits" IS NULL OR "loadedUnits" BETWEEN 0 AND "expectedUnits")
  AND ("status" <> 'COMPLETE' OR "loadedUnits" IS NOT NULL)
  AND ("loadedUnits" IS NULL OR ("recordedByUserId" IS NOT NULL AND "recordedAt" IS NOT NULL))
  AND ("loadedUnits" IS NULL OR "loadedUnits" = "expectedUnits" OR
    (coalesce(length(trim("reason")), 0) > 0 AND "reviewStatus" <> 'NOT_REQUIRED'))
  AND ("reviewStatus" <> 'APPROVED' OR ("reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL)));
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "Delivery_quantities_outcome" CHECK (
  "expectedLoadedUnits" >= 0 AND "deliveredUnits" BETWEEN 0 AND "expectedLoadedUnits" AND "completedAt" >= "arrivedAt"
  AND (("outcome" = 'DELIVERED' AND "deliveredUnits" = "expectedLoadedUnits" AND "deliveredUnits" > 0)
    OR ("outcome" = 'PARTIALLY_DELIVERED' AND "deliveredUnits" > 0 AND "deliveredUnits" < "expectedLoadedUnits")
    OR ("outcome" = 'FAILED' AND "deliveredUnits" = 0))
  AND ("outcome" = 'DELIVERED' OR coalesce(length(trim("driverNote")), 0) > 0));
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "Proof_durable_keys" CHECK (
  ("photoStorageKey" IS NULL OR "photoStorageKey" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$')
  AND ("signatureStorageKey" IS NULL OR "signatureStorageKey" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$')
  AND coalesce("photoStorageKey", '') !~ '(^|/)\.\.(/|$)'
  AND coalesce("signatureStorageKey", '') !~ '(^|/)\.\.(/|$)');
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issue" CHECK (
  "receivedUnits" >= 0 AND ("status" <> 'ISSUE_REPORTED' OR coalesce(length(trim("issueNote")), 0) > 0));
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_link_and_resolution" CHECK (
  num_nonnulls("orderId", "tripId", "loadRecordId", "deliveryRecordId", "receiptId") > 0
  AND length(trim("message")) > 0 AND (("status" = 'RESOLVED') = ("resolvedAt" IS NOT NULL)));
ALTER TABLE "DeferralRecord" ADD CONSTRAINT "Deferral_detail" CHECK (length(trim("reasonDetail")) > 0);
ALTER TABLE "AuditEvent" ADD CONSTRAINT "Audit_safe_shape" CHECK (
  jsonb_typeof("metadata") = 'object' AND (("actorUserId" IS NULL) = ("actorRole" IS NULL)));
ALTER TABLE "FuelLedger" ADD CONSTRAINT "Fuel_opening_week" CHECK (
  EXTRACT(ISODOW FROM "weekStart") = 1 AND ("openingConsumedLitres" IS NULL OR "openingConsumedLitres" >= 0)
  AND (("openingConsumedLitres" IS NULL) = ("openingSource" IS NULL)));
ALTER TABLE "FuelUsage" ADD CONSTRAINT "Fuel_usage_positive" CHECK ("litres" > 0);

CREATE FUNCTION waypoint_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Orders must begin as drafts'; END IF;
    RETURN NEW;
  END IF;
  IF (OLD."status" <> 'DRAFT' OR EXISTS (SELECT 1 FROM "TripStop" WHERE "orderId" = OLD.id)) AND ROW(NEW."orderRef", NEW."orderedUnits", NEW."orderedWeightKg", NEW."orderedVolumeM3", NEW."outletId", NEW."requestedDeliveryDate", NEW."temperatureRequirement")
    IS DISTINCT FROM ROW(OLD."orderRef", OLD."orderedUnits", OLD."orderedWeightKg", OLD."orderedVolumeM3", OLD."outletId", OLD."requestedDeliveryDate", OLD."temperatureRequirement") THEN
    RAISE EXCEPTION 'Confirmed order request facts are immutable';
  END IF;
  IF NEW."status" <> OLD."status" AND coalesce(current_setting('waypoint.lifecycle', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Use the authoritative order lifecycle service';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Order_guard" BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION waypoint_order_guard();

CREATE FUNCTION waypoint_stop_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_depot uuid; vehicle_depot uuid; requested_date date; trip_date date;
BEGIN
  SELECT o."depotId", r."requestedDeliveryDate" INTO order_depot, requested_date FROM "Order" r JOIN "Outlet" o ON o.id = r."outletId" WHERE r.id = NEW."orderId";
  SELECT v."depotId", t."serviceDate" INTO vehicle_depot, trip_date FROM "Trip" t JOIN "Vehicle" v ON v.id = t."vehicleId" WHERE t.id = NEW."tripId";
  IF order_depot <> vehicle_depot OR trip_date < requested_date THEN RAISE EXCEPTION 'Stop order depot/date does not match trip structure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TripStop_guard" BEFORE INSERT OR UPDATE ON "TripStop" FOR EACH ROW EXECUTE FUNCTION waypoint_stop_guard();

CREATE FUNCTION waypoint_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_depot uuid; run_date date; trip_depot uuid; trip_date date;
BEGIN
  IF NEW."tripStopId" IS NOT NULL THEN
    SELECT p."depotId", p."serviceDate" INTO run_depot, run_date FROM "PlanningRun" p WHERE p.id = NEW."planningRunId";
    SELECT v."depotId", t."serviceDate" INTO trip_depot, trip_date FROM "TripStop" s JOIN "Trip" t ON t.id = s."tripId" JOIN "Vehicle" v ON v.id = t."vehicleId" WHERE s.id = NEW."tripStopId";
    IF run_depot <> trip_depot OR run_date <> trip_date THEN RAISE EXCEPTION 'Allocation run and trip depot/date differ'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Allocation_guard" BEFORE INSERT OR UPDATE ON "Allocation" FOR EACH ROW EXECUTE FUNCTION waypoint_allocation_guard();

CREATE FUNCTION waypoint_quantity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; delivered integer;
BEGIN
  IF TG_TABLE_NAME = 'LoadRecord' THEN
    SELECT o."orderedUnits" INTO expected FROM "TripStop" s JOIN "Order" o ON o.id = s."orderId" WHERE s.id = NEW."tripStopId";
    IF NEW."expectedUnits" <> expected THEN RAISE EXCEPTION 'Load expected units must retain the original ordered units'; END IF;
    IF TG_OP = 'UPDATE' AND NEW."loadedUnits" IS DISTINCT FROM OLD."loadedUnits" AND EXISTS (SELECT 1 FROM "DeliveryRecord" WHERE "loadRecordId" = OLD.id) THEN
      RAISE EXCEPTION 'Loaded facts cannot change after delivery recording';
    END IF;
  ELSIF TG_TABLE_NAME = 'DeliveryRecord' THEN
    SELECT l."loadedUnits" INTO expected FROM "LoadRecord" l WHERE l.id = NEW."loadRecordId";
    IF expected IS NULL OR NEW."expectedLoadedUnits" <> expected THEN RAISE EXCEPTION 'Delivery must reference the actual loaded quantity'; END IF;
    IF TG_OP = 'UPDATE' AND ROW(NEW."deliveredUnits", NEW."outcome") IS DISTINCT FROM ROW(OLD."deliveredUnits", OLD."outcome") AND EXISTS (SELECT 1 FROM "Receipt" WHERE "deliveryRecordId" = OLD.id) THEN
      RAISE EXCEPTION 'Delivery facts cannot change after receipt recording';
    END IF;
  ELSIF TG_TABLE_NAME = 'Receipt' THEN
    SELECT d."deliveredUnits" INTO delivered FROM "DeliveryRecord" d WHERE d.id = NEW."deliveryRecordId";
    IF NEW.status = 'CONFIRMED' AND NEW."receivedUnits" <> delivered THEN RAISE EXCEPTION 'Receipt discrepancy cannot be clean confirmation'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Load_quantity_guard" BEFORE INSERT OR UPDATE ON "LoadRecord" FOR EACH ROW EXECUTE FUNCTION waypoint_quantity_guard();
CREATE TRIGGER "Delivery_quantity_guard" BEFORE INSERT OR UPDATE ON "DeliveryRecord" FOR EACH ROW EXECUTE FUNCTION waypoint_quantity_guard();
CREATE TRIGGER "Receipt_quantity_guard" BEFORE INSERT OR UPDATE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION waypoint_quantity_guard();

CREATE FUNCTION waypoint_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END $$;
CREATE TRIGGER "Audit_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION waypoint_append_only();
CREATE FUNCTION waypoint_deferral_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Deferral history cannot be erased'; END IF;
  IF (to_jsonb(NEW) - 'resolvedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'resolvedAt')
    OR (OLD."resolvedAt" IS NOT NULL AND NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt") THEN
    RAISE EXCEPTION 'Deferral history is immutable except first resolution';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Deferral_history" BEFORE UPDATE OR DELETE ON "DeferralRecord" FOR EACH ROW EXECUTE FUNCTION waypoint_deferral_history();

CREATE FUNCTION waypoint_fuel_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ledger_vehicle uuid; trip_vehicle uuid; ledger_week date; usage_date date; trip_date date;
BEGIN
  SELECT "vehicleId", "weekStart" INTO ledger_vehicle, ledger_week FROM "FuelLedger" WHERE id = NEW."ledgerId";
  usage_date := (NEW."occurredAt" AT TIME ZONE 'Asia/Colombo')::date;
  IF usage_date < ledger_week OR usage_date >= ledger_week + 7 THEN RAISE EXCEPTION 'Fuel usage is outside Colombo ledger week'; END IF;
  IF NEW."tripId" IS NOT NULL THEN
    SELECT "vehicleId", "serviceDate" INTO trip_vehicle, trip_date FROM "Trip" WHERE id = NEW."tripId";
    IF trip_vehicle <> ledger_vehicle OR trip_date < ledger_week OR trip_date >= ledger_week + 7 THEN RAISE EXCEPTION 'Fuel trip does not belong to ledger vehicle/week'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Fuel_usage_guard" BEFORE INSERT OR UPDATE ON "FuelUsage" FOR EACH ROW EXECUTE FUNCTION waypoint_fuel_guard();

CREATE FUNCTION waypoint_actor_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor_role "Role"; assigned_driver uuid; store_outlet uuid;
BEGIN
  IF TG_TABLE_NAME = 'Trip' THEN
    IF NEW."driverUserId" IS NOT NULL THEN
      SELECT role INTO actor_role FROM "User" WHERE id = NEW."driverUserId" AND active = true;
      IF actor_role IS DISTINCT FROM 'DRIVER'::"Role" THEN RAISE EXCEPTION 'Trip assignment requires an active Driver'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'LoadRecord' THEN
    IF NEW."recordedByUserId" IS NOT NULL THEN
      SELECT role INTO actor_role FROM "User" WHERE id = NEW."recordedByUserId";
      IF actor_role IS DISTINCT FROM 'LOADER'::"Role" THEN RAISE EXCEPTION 'Loading recorder must be a Loader'; END IF;
    END IF;
    IF NEW."reviewedByUserId" IS NOT NULL THEN
      SELECT role INTO actor_role FROM "User" WHERE id = NEW."reviewedByUserId";
      IF actor_role IS DISTINCT FROM 'DISPATCHER'::"Role" THEN RAISE EXCEPTION 'Loading reviewer must be a Dispatcher'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'DeliveryRecord' THEN
    SELECT role INTO actor_role FROM "User" WHERE id = NEW."recordedByDriverId";
    SELECT t."driverUserId" INTO assigned_driver FROM "TripStop" s JOIN "Trip" t ON t.id = s."tripId" WHERE s.id = NEW."tripStopId";
    IF actor_role IS DISTINCT FROM 'DRIVER'::"Role" OR assigned_driver IS DISTINCT FROM NEW."recordedByDriverId" THEN RAISE EXCEPTION 'Delivery recorder must be the assigned Driver'; END IF;
  ELSIF TG_TABLE_NAME = 'Receipt' THEN
    SELECT role INTO actor_role FROM "User" WHERE id = NEW."confirmedByUserId";
    SELECT o."outletId" INTO store_outlet FROM "DeliveryRecord" d JOIN "TripStop" s ON s.id = d."tripStopId" JOIN "Order" o ON o.id = s."orderId" WHERE d.id = NEW."deliveryRecordId";
    IF actor_role IS DISTINCT FROM 'STORE_MANAGER'::"Role" OR NOT EXISTS (SELECT 1 FROM "UserOutlet" WHERE "userId" = NEW."confirmedByUserId" AND "outletId" = store_outlet) THEN RAISE EXCEPTION 'Receipt requires the assigned Store Manager'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Trip_actor_guard" BEFORE INSERT OR UPDATE ON "Trip" FOR EACH ROW EXECUTE FUNCTION waypoint_actor_guard();
CREATE TRIGGER "Load_actor_guard" BEFORE INSERT OR UPDATE ON "LoadRecord" FOR EACH ROW EXECUTE FUNCTION waypoint_actor_guard();
CREATE TRIGGER "Delivery_actor_guard" BEFORE INSERT OR UPDATE ON "DeliveryRecord" FOR EACH ROW EXECUTE FUNCTION waypoint_actor_guard();
CREATE TRIGGER "Receipt_actor_guard" BEFORE INSERT OR UPDATE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION waypoint_actor_guard();

ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_official_provenance" CHECK ("source" <> 'OFFICIAL' OR "importId" IS NOT NULL);
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_official_provenance" CHECK ("source" <> 'OFFICIAL' OR "importId" IS NOT NULL);
ALTER TABLE "CalendarDay" ADD CONSTRAINT "Calendar_official_provenance" CHECK ("source" <> 'OFFICIAL' OR "importId" IS NOT NULL);
ALTER TABLE "DistrictTravel" ADD CONSTRAINT "Travel_official_provenance" CHECK ("source" <> 'OFFICIAL' OR "importId" IS NOT NULL);
ALTER TABLE "ServiceAllowance" ADD CONSTRAINT "Allowance_official_provenance" CHECK ("source" <> 'OFFICIAL' OR "importId" IS NOT NULL);

CREATE FUNCTION waypoint_trip_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."vehicleId", NEW."serviceDate", NEW."tripNumber") IS DISTINCT FROM ROW(OLD."vehicleId", OLD."serviceDate", OLD."tripNumber")
    AND (EXISTS (SELECT 1 FROM "TripStop" WHERE "tripId" = OLD.id) OR EXISTS (SELECT 1 FROM "FuelUsage" WHERE "tripId" = OLD.id)) THEN
    RAISE EXCEPTION 'Trip vehicle/date cannot change after stop assignment';
  END IF;
  IF NEW."driverUserId" IS DISTINCT FROM OLD."driverUserId" AND EXISTS (SELECT 1 FROM "DeliveryRecord" d JOIN "TripStop" s ON s.id = d."tripStopId" WHERE s."tripId" = OLD.id) THEN
    RAISE EXCEPTION 'Recorded delivery driver history cannot be reassigned';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Trip_history_guard" BEFORE UPDATE ON "Trip" FOR EACH ROW EXECUTE FUNCTION waypoint_trip_history_guard();

CREATE FUNCTION waypoint_fuel_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Fuel history must be retained'; END IF;
  IF TG_TABLE_NAME = 'FuelUsage' THEN
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN RAISE EXCEPTION 'Fuel facts are immutable; use a reviewed correction record'; END IF;
  ELSE
    IF ROW(NEW."vehicleId", NEW."weekStart") IS DISTINCT FROM ROW(OLD."vehicleId", OLD."weekStart") AND EXISTS (SELECT 1 FROM "FuelUsage" WHERE "ledgerId" = OLD.id) THEN RAISE EXCEPTION 'Fuel ledger vehicle/week history is immutable'; END IF;
    IF OLD."openingConsumedLitres" IS NOT NULL AND ROW(NEW."vehicleId", NEW."weekStart", NEW."openingConsumedLitres", NEW."openingSource")
      IS DISTINCT FROM ROW(OLD."vehicleId", OLD."weekStart", OLD."openingConsumedLitres", OLD."openingSource") THEN RAISE EXCEPTION 'Established fuel opening history is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Fuel_usage_history" BEFORE UPDATE OR DELETE ON "FuelUsage" FOR EACH ROW EXECUTE FUNCTION waypoint_fuel_history_guard();
CREATE TRIGGER "Fuel_ledger_history" BEFORE UPDATE OR DELETE ON "FuelLedger" FOR EACH ROW EXECUTE FUNCTION waypoint_fuel_history_guard();

ALTER TABLE "Exception" ADD CONSTRAINT "Exception_category_link" CHECK (
  ("type" <> 'LOADING_SHORTFALL' OR "loadRecordId" IS NOT NULL)
  AND ("type" NOT IN ('DELIVERY_PARTIAL', 'DELIVERY_FAILED') OR "deliveryRecordId" IS NOT NULL)
  AND ("type" <> 'RECEIPT_DISCREPANCY' OR "receiptId" IS NOT NULL));
CREATE FUNCTION waypoint_exception_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_count integer; trip_count integer; linked_order uuid; linked_trip uuid;
BEGIN
  WITH links AS (
    SELECT s."orderId", s."tripId" FROM "LoadRecord" l JOIN "TripStop" s ON s.id = l."tripStopId" WHERE l.id = NEW."loadRecordId"
    UNION ALL SELECT s."orderId", s."tripId" FROM "DeliveryRecord" d JOIN "TripStop" s ON s.id = d."tripStopId" WHERE d.id = NEW."deliveryRecordId"
    UNION ALL SELECT s."orderId", s."tripId" FROM "Receipt" r JOIN "DeliveryRecord" d ON d.id = r."deliveryRecordId" JOIN "TripStop" s ON s.id = d."tripStopId" WHERE r.id = NEW."receiptId"
  ) SELECT count(DISTINCT "orderId"), count(DISTINCT "tripId"), min("orderId"::text)::uuid, min("tripId"::text)::uuid
    INTO order_count, trip_count, linked_order, linked_trip FROM links;
  IF order_count > 1 OR trip_count > 1 OR (NEW."orderId" IS NOT NULL AND linked_order IS NOT NULL AND NEW."orderId" <> linked_order)
    OR (NEW."tripId" IS NOT NULL AND linked_trip IS NOT NULL AND NEW."tripId" <> linked_trip) THEN RAISE EXCEPTION 'Exception references must describe the same operational object'; END IF;
  IF NEW."orderId" IS NOT NULL AND NEW."tripId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TripStop" WHERE "orderId" = NEW."orderId" AND "tripId" = NEW."tripId") THEN RAISE EXCEPTION 'Exception order is not assigned to its trip'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Exception_reference_guard" BEFORE INSERT OR UPDATE ON "Exception" FOR EACH ROW EXECUTE FUNCTION waypoint_exception_guard();

CREATE FUNCTION waypoint_relation_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fields text[];
BEGIN
  fields := CASE TG_TABLE_NAME
    WHEN 'TripStop' THEN ARRAY['tripId','orderId']
    WHEN 'LoadRecord' THEN ARRAY['tripStopId']
    WHEN 'DeliveryRecord' THEN ARRAY['tripStopId','loadRecordId']
    WHEN 'Receipt' THEN ARRAY['deliveryRecordId']
    WHEN 'DeliveryProof' THEN ARRAY['deliveryRecordId']
    WHEN 'Allocation' THEN ARRAY['orderId','planningRunId','tripStopId','decision'] END;
  IF EXISTS (SELECT 1 FROM unnest(fields) field WHERE (to_jsonb(NEW) -> field) IS DISTINCT FROM (to_jsonb(OLD) -> field)) THEN RAISE EXCEPTION 'Operational history relationships cannot be retargeted'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Stop_relation_history" BEFORE UPDATE ON "TripStop" FOR EACH ROW EXECUTE FUNCTION waypoint_relation_history_guard();
CREATE TRIGGER "Load_relation_history" BEFORE UPDATE ON "LoadRecord" FOR EACH ROW EXECUTE FUNCTION waypoint_relation_history_guard();
CREATE TRIGGER "Delivery_relation_history" BEFORE UPDATE ON "DeliveryRecord" FOR EACH ROW EXECUTE FUNCTION waypoint_relation_history_guard();
CREATE TRIGGER "Receipt_relation_history" BEFORE UPDATE ON "Receipt" FOR EACH ROW EXECUTE FUNCTION waypoint_relation_history_guard();
CREATE TRIGGER "Proof_relation_history" BEFORE UPDATE ON "DeliveryProof" FOR EACH ROW EXECUTE FUNCTION waypoint_relation_history_guard();
CREATE TRIGGER "Allocation_relation_history" BEFORE UPDATE ON "Allocation" FOR EACH ROW EXECUTE FUNCTION waypoint_relation_history_guard();

CREATE FUNCTION waypoint_depot_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'Outlet' THEN
    IF ROW(NEW."depotId", NEW."brand") IS DISTINCT FROM ROW(OLD."depotId", OLD."brand") AND EXISTS (SELECT 1 FROM "Order" WHERE "outletId" = OLD.id) THEN RAISE EXCEPTION 'Outlet depot/brand is part of existing order history'; END IF;
  ELSE
    IF NEW."depotId" <> OLD."depotId" AND EXISTS (SELECT 1 FROM "Trip" WHERE "vehicleId" = OLD.id) THEN RAISE EXCEPTION 'Vehicle depot is part of existing trip history'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Outlet_depot_history" BEFORE UPDATE ON "Outlet" FOR EACH ROW EXECUTE FUNCTION waypoint_depot_history_guard();
CREATE TRIGGER "Vehicle_depot_history" BEFORE UPDATE ON "Vehicle" FOR EACH ROW EXECUTE FUNCTION waypoint_depot_history_guard();

COMMIT;

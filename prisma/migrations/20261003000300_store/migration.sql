BEGIN;

CREATE TYPE "ReceiptIssueType" AS ENUM ('QUANTITY_DISCREPANCY', 'DAMAGED_GOODS', 'OTHER');
ALTER TABLE "Order" ADD COLUMN "eligibleDeliveryDate" DATE;
UPDATE "Order" SET "eligibleDeliveryDate" = "requestedDeliveryDate";
ALTER TABLE "Order" ADD CONSTRAINT "Order_eligibleDeliveryDate_fkey" FOREIGN KEY ("eligibleDeliveryDate") REFERENCES "CalendarDay"("date") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_eligibility_date" CHECK ("eligibleDeliveryDate" IS NULL OR "eligibleDeliveryDate" >= "requestedDeliveryDate");
ALTER TABLE "Receipt" ADD COLUMN "issueType" "ReceiptIssueType";
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_issue_type" CHECK ("issueType" IS NULL OR "status" = 'ISSUE_REPORTED');

CREATE OR REPLACE FUNCTION waypoint_order_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Orders must begin as drafts'; END IF;
    RETURN NEW;
  END IF;
  IF (OLD."status" <> 'DRAFT' OR EXISTS (SELECT 1 FROM "TripStop" WHERE "orderId" = OLD.id)) AND
    ROW(NEW."orderRef", NEW."orderedUnits", NEW."orderedWeightKg", NEW."orderedVolumeM3", NEW."outletId", NEW."requestedDeliveryDate", NEW."eligibleDeliveryDate", NEW."temperatureRequirement")
    IS DISTINCT FROM ROW(OLD."orderRef", OLD."orderedUnits", OLD."orderedWeightKg", OLD."orderedVolumeM3", OLD."outletId", OLD."requestedDeliveryDate", OLD."eligibleDeliveryDate", OLD."temperatureRequirement") THEN
    RAISE EXCEPTION 'Confirmed order request facts are immutable';
  END IF;
  IF NEW."status" <> OLD."status" AND coalesce(current_setting('waypoint.lifecycle', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Use the authoritative order lifecycle service';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION waypoint_stop_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_depot uuid; vehicle_depot uuid; eligible_date date; trip_date date;
BEGIN
  SELECT o."depotId", COALESCE(r."eligibleDeliveryDate", r."requestedDeliveryDate") INTO order_depot, eligible_date
    FROM "Order" r JOIN "Outlet" o ON o.id = r."outletId" WHERE r.id = NEW."orderId";
  SELECT v."depotId", t."serviceDate" INTO vehicle_depot, trip_date FROM "Trip" t JOIN "Vehicle" v ON v.id = t."vehicleId" WHERE t.id = NEW."tripId";
  IF order_depot <> vehicle_depot OR trip_date < eligible_date THEN RAISE EXCEPTION 'Stop order depot/eligible date does not match trip structure'; END IF;
  RETURN NEW;
END $$;

COMMIT;

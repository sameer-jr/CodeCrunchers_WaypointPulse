ALTER TYPE "AuditEventType" ADD VALUE 'OUTLET_LOCATION_RECORDED';
ALTER TYPE "AuditEntityType" ADD VALUE 'OUTLET';

CREATE TABLE "DeliveryAttachment" (
  "id" UUID PRIMARY KEY,
  "proofId" UUID NOT NULL REFERENCES "DeliveryProof"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" VARCHAR(12) NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "contentType" VARCHAR(24) NOT NULL CHECK ("contentType" IN ('image/jpeg', 'image/png')),
  "bytes" BYTEA NOT NULL,
  "sha256" VARCHAR(64) NOT NULL CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  "byteLength" INTEGER NOT NULL CHECK ("byteLength" > 0 AND "byteLength" = octet_length("bytes")),
  "width" INTEGER NOT NULL CHECK ("width" > 0 AND "width" <= 1600),
  "height" INTEGER NOT NULL CHECK ("height" > 0 AND "height" <= 1600),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryAttachment_kind_limit" CHECK (
    ("kind" = 'PHOTO' AND "ordinal" BETWEEN 0 AND 2 AND "byteLength" <= 1048576)
    OR ("kind" = 'SIGNATURE' AND "ordinal" = 3 AND "contentType" = 'image/png' AND "height" <= 800 AND "byteLength" <= 262144))
);
CREATE UNIQUE INDEX "DeliveryAttachment_proofId_ordinal_key" ON "DeliveryAttachment"("proofId", "ordinal");
CREATE INDEX "DeliveryAttachment_proofId_idx" ON "DeliveryAttachment"("proofId");

CREATE FUNCTION waypoint_attachment_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Delivery attachment evidence cannot be replaced or erased';
END $$;
CREATE TRIGGER "DeliveryAttachment_history" BEFORE UPDATE OR DELETE ON "DeliveryAttachment"
  FOR EACH ROW EXECUTE FUNCTION waypoint_attachment_history();

CREATE TABLE "OutletLocation" (
  "outletId" UUID PRIMARY KEY REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "latitude" DECIMAL(10,7) NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" DECIMAL(10,7) NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "label" VARCHAR(120),
  "recordedByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0)
);
CREATE TABLE "TripPosition" (
  "tripId" UUID PRIMARY KEY REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "driverUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "latitude" DECIMAL(10,7) NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" DECIMAL(10,7) NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "accuracyMetres" DECIMAL(10,3) NOT NULL CHECK ("accuracyMetres" BETWEEN 0 AND 10000),
  "eventAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

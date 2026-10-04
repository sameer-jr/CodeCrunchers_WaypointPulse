-- Eligible demand by date/status and deterministic exception pagination.
-- Read-only Dispatcher foundation: no operational data or state is changed.
CREATE INDEX "Order_eligibleDeliveryDate_status_idx" ON "Order"("eligibleDeliveryDate", "status");
CREATE INDEX "Exception_createdAt_id_idx" ON "Exception"("createdAt", "id");

BEGIN;

CREATE FUNCTION waypoint_released_run_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."strategyVersion" IS NOT NULL AND OLD."status" = 'RELEASED' THEN
    RAISE EXCEPTION 'Released generated planning history is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PlanningRun_released_history" BEFORE UPDATE OR DELETE ON "PlanningRun"
  FOR EACH ROW EXECUTE FUNCTION waypoint_released_run_history_guard();

CREATE FUNCTION waypoint_released_decision_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_id UUID; is_released BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'TripStop' THEN
    SELECT "planningRunId" INTO run_id FROM "Trip" WHERE "id" = CASE WHEN TG_OP = 'INSERT' THEN NEW."tripId" ELSE OLD."tripId" END;
  ELSE
    run_id := CASE WHEN TG_OP = 'INSERT' THEN NEW."planningRunId" ELSE OLD."planningRunId" END;
  END IF;
  SELECT "strategyVersion" IS NOT NULL AND "status" = 'RELEASED' INTO is_released FROM "PlanningRun" WHERE "id" = run_id;
  IF is_released THEN
    IF TG_OP IN ('INSERT', 'DELETE') THEN
      RAISE EXCEPTION 'Released generated planning history is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'Allocation' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION 'Released generated planning history is immutable' USING ERRCODE = '23514';
    ELSIF TG_TABLE_NAME = 'Trip' THEN
      IF ROW(NEW."planningRunId", NEW."tripRef", NEW."vehicleId", NEW."serviceDate", NEW."tripNumber", NEW."plannedDeparture", NEW."plannedReturn", NEW."estimatedDistanceKm", NEW."estimatedFuelLitres")
        IS DISTINCT FROM ROW(OLD."planningRunId", OLD."tripRef", OLD."vehicleId", OLD."serviceDate", OLD."tripNumber", OLD."plannedDeparture", OLD."plannedReturn", OLD."estimatedDistanceKm", OLD."estimatedFuelLitres") THEN
        RAISE EXCEPTION 'Released generated planning history is immutable' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'TripStop' THEN
      IF ROW(NEW."tripId", NEW."orderId", NEW."sequence", NEW."plannedArrival", NEW."plannedServiceStart", NEW."plannedServiceComplete", NEW."plannedWaitingMinutes", NEW."plannedServiceMinutes")
        IS DISTINCT FROM ROW(OLD."tripId", OLD."orderId", OLD."sequence", OLD."plannedArrival", OLD."plannedServiceStart", OLD."plannedServiceComplete", OLD."plannedWaitingMinutes", OLD."plannedServiceMinutes") THEN
        RAISE EXCEPTION 'Released generated planning history is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Allocation_released_history" BEFORE INSERT OR UPDATE OR DELETE ON "Allocation"
  FOR EACH ROW EXECUTE FUNCTION waypoint_released_decision_history_guard();
CREATE TRIGGER "Trip_released_plan_history" BEFORE INSERT OR UPDATE OR DELETE ON "Trip"
  FOR EACH ROW EXECUTE FUNCTION waypoint_released_decision_history_guard();
CREATE TRIGGER "TripStop_released_plan_history" BEFORE INSERT OR UPDATE OR DELETE ON "TripStop"
  FOR EACH ROW EXECUTE FUNCTION waypoint_released_decision_history_guard();

COMMIT;

import { Check, ShieldQuestion, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PlanningConstraintCheck, PlanningDecisionDetail, PlanningRunDetail } from '@waypoint/shared';
import { dateLabel, EmptyState, Facts, Panel, sentenceCase, timeLabel } from './components';
import { dispatcherLink, useDispatcherParams } from './url';

export function PlanChecks({ checks }: { checks: PlanningConstraintCheck[] }) {
  return <ul className="dispatch-plan-checks">{checks.map((check, index) => <li className={check.passed ? 'passed' : 'failed'} key={`${check.code}-${index}`}><span>{check.passed ? <Check size={15} /> : <TriangleAlert size={15} />}</span><div><strong>{sentenceCase(check.code)} · {check.passed ? 'Pass' : 'Blocked'}</strong><p>{check.reason}</p><small>Actual: {check.actual} · Required: {check.required}</small></div></li>)}</ul>;
}

function PlanValidation({ plan }: { plan: PlanningRunDetail | undefined }) {
  const { params, update } = useDispatcherParams();
  const validation = plan?.validation;
  const needsReview = !!validation?.valid && !!plan && (plan.stale || plan.status === 'VALIDATED' && !plan.canRelease);
  const historical = plan?.status === 'RELEASED' || plan?.status === 'SUPERSEDED';
  const title = !validation ? 'Validation has not run' : validation.valid ? needsReview ? 'Recorded validation needs review' : historical ? 'Recorded validation passed' : 'Plan valid' : `Plan has ${validation.issues.length} blocking issue${validation.issues.length === 1 ? '' : 's'}`;
  return <Panel kicker="INDEPENDENT VALIDATION" title={title}><div className="dispatch-panel-body">
    {!plan ? <p className="dispatch-helper">Generation and validation are separate operations.</p> : !validation ? <p className="dispatch-note warning">Generated checks explain allocation choices. Run Validate Plan to independently check the persisted plan before release.</p> : <>
      <p className={`dispatch-note ${validation.valid && !needsReview ? 'neutral' : 'warning'}`}>{needsReview ? 'The saved validation passed, but this plan is no longer currently eligible for release. Review its current facts and validate or regenerate the active draft.' : validation.valid ? 'The independent validator passed the recorded plan.' : 'Blocking findings prevent release. Review these findings and regenerate a current draft when permitted.'}</p>
      <p className="dispatch-helper">Checked {timeLabel(validation.checkedAt)}{plan.stale ? ' · current inputs have changed' : ''}</p>
      {validation.issues.length > 0 && <ul className="dispatch-validation-issues">{validation.issues.map((issue, index) => {
        const decision = plan.decisions.find(row => row.order.id === issue.orderId);
        const trip = plan.trips.find(row => `${row.vehicle.id}:${row.tripNumber}` === issue.tripKey);
        return <li key={`${issue.code}-${index}`}><strong>{sentenceCase(issue.code)}</strong><p>{issue.message}</p>{issue.orderId && (decision ? <button className="dispatch-text-link" onClick={() => { update({ planOrder: decision.order.id }, false); document.getElementById(`plan-decision-${decision.id}`)?.focus(); }}>Locate affected order</button> : <Link className="dispatch-text-link" to={dispatcherLink('orders', params, { order: issue.orderId, date: plan.serviceDate })}>Open affected order</Link>)}{trip && <Link className="dispatch-text-link" to={dispatcherLink('routes', params, { trip: trip.id, date: plan.serviceDate })}>Review {trip.vehicle.vehicleRef} · Trip {trip.tripNumber}</Link>}</li>;
      })}</ul>}
    </>}
    <p className="dispatch-helper dispatch-footnote">{plan ? `Strategy ${plan.strategyVersion}. Deterministic heuristic with recorded constraints; global optimality is not claimed.` : 'Release requires a current, independently validated plan.'}</p>
  </div></Panel>;
}

export function PlanEvidence({ plan, selected }: { plan: PlanningRunDetail | undefined; selected: PlanningDecisionDetail | undefined }) {
  const { params } = useDispatcherParams();
  const assignedTrip = plan?.trips.find(trip => trip.id === selected?.tripId);
  return <aside className="dispatch-stack"><Panel kicker="EXPLAIN MY PLAN" title={selected ? selected.order.orderRef : 'Select an order decision'} action={<ShieldQuestion size={23} />}><div className="dispatch-panel-body">{!plan ? <EmptyState title="No plan generated yet" message="Generate a plan to inspect its real assignment decisions, failed constraints and independent validation." /> : !selected ? <EmptyState title="No decision selected" message="Select a served or deferred order from this run." /> : <><p className={`dispatch-note ${selected.decision === 'DEFERRED' ? 'warning' : 'neutral'}`}>{selected.reason}</p><p className="dispatch-helper">{selected.order.outlet.outletRef} · {sentenceCase(selected.order.outlet.brand)} · {selected.order.outlet.district}</p><Facts facts={[
    ['Decision', selected.decision === 'ASSIGNED' ? 'Served in this plan' : 'Deferred'], ['Assigned vehicle / trip', assignedTrip ? `${assignedTrip.vehicle.vehicleRef} · Trip ${assignedTrip.tripNumber}` : 'No assigned trip'], ['Temperature', sentenceCase(selected.order.temperatureRequirement)], ['Access', sentenceCase(selected.order.outlet.accessConstraint)], ['Shipment weight', `${selected.order.orderedWeightKg} kg`], ['Shipment volume', `${selected.order.orderedVolumeM3} m³`], ['Requested date', dateLabel(selected.order.requestedDeliveryDate)]
  ]} /><h3 className="dispatch-detail-title">Recorded constraint checks</h3>{selected.checks.length ? <PlanChecks checks={selected.checks} /> : <p className="dispatch-helper">No passing candidate checks were recorded. Inspect the rejection evidence below.</p>}<h3 className="dispatch-detail-title">Priority context</h3><Facts facts={[
    ['Previous deferrals', String(selected.priority.previousDeferrals)], ['Capability-compatible vehicles', String(selected.priority.compatibleVehicles)], ['Effective priority window', `${selected.priority.windowMinutes} minutes`], ['Eligible date', dateLabel(selected.priority.eligibleDate)], ['Request created', timeLabel(selected.priority.createdAt)], ['Next eligible date', selected.nextEligibleDate ? dateLabel(selected.nextEligibleDate) : 'Not recorded']
  ]} /><p className="dispatch-helper dispatch-footnote">Capability counts use available master records with matching temperature and access. Fuel, capacity and timing are checked separately. The effective priority window includes Fresh urgency.</p><h3 className="dispatch-detail-title">Rejected alternatives</h3><p className="dispatch-helper">Up to three recorded rejection examples from the allocation decision, ordered by fewer blocking checks. This sample is not exhaustive.</p>{selected.alternatives.length ? <div className="dispatch-plan-alternatives">{selected.alternatives.map((alternative, index) => <details key={`${alternative.vehicleId}-${alternative.tripNumber}-${index}`}><summary>{alternative.vehicleRef} · Trip {alternative.tripNumber}<span>{alternative.checks.filter(check => !check.passed).length} blocked checks</span></summary><PlanChecks checks={alternative.checks} /></details>)}</div> : <p className="dispatch-helper">No rejected alternatives were recorded for this decision.</p>}<Link className="btn secondary dispatch-block" to={dispatcherLink('orders', params, { order: selected.order.id, date: selected.order.operationalDate })}>Open order details</Link></>}</div></Panel><PlanValidation plan={plan} /></aside>;
}

import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultFinancialTrackingSelection, resolveFinancialTrackingStartDate } from "../src/lib/data/financialTracking";
import { buildRentLedger, getChargeId } from "../src/lib/data/rentLedgerService";
import { generateRentSchedule } from "../src/lib/data/rentSchedule";
import type { Lease, LocalStore, PaymentAllocation, PaymentTransaction } from "../src/lib/types";

const today = "2026-09-25";

test("A. current lease starts tracking at its real start", () => {
  const schedule = generateRentSchedule(lease({ startDate: today, endDate: "2027-09-24", financialTrackingStartDate: today }), today);
  assert.deepEqual(schedule.map((item) => item.periodMonth), ["2026-09", "2026-10", "2026-11", "2026-12"]);
  assert.equal(schedule[0].dueDate, today);
});

test("B. future lease does not generate periods before its start", () => {
  const schedule = generateRentSchedule(lease({ startDate: "2026-11-01", endDate: "2027-10-31", financialTrackingStartDate: "2026-11-01" }), today);
  assert.deepEqual(schedule.map((item) => item.periodMonth), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("C. past-start active lease defaults to the current rent period", () => {
  const selection = getDefaultFinancialTrackingSelection("2025-07-01", "2027-06-30", today);
  assert.equal(selection.mode, "current_period");
  assert.equal(resolveFinancialTrackingStartDate({ ...selection, startDate: "2025-07-01", endDate: "2027-06-30", today }), "2026-09-01");

  const schedule = generateRentSchedule(lease({ financialTrackingStartDate: "2026-09-01" }), today);
  assert.deepEqual(schedule.map((item) => item.periodMonth), ["2026-09", "2026-10", "2026-11", "2026-12"]);
});

test("D. explicit history from lease start is preserved", () => {
  const schedule = generateRentSchedule(lease({ financialTrackingStartDate: "2025-07-01" }), today);
  assert.equal(schedule[0].periodMonth, "2025-07");
  assert.equal(schedule.at(-1)?.periodMonth, "2026-12");
});

test("E. custom tracking date excludes every earlier period", () => {
  const trackingStartDate = resolveFinancialTrackingStartDate({
    mode: "custom",
    customDate: "2026-03-01",
    startDate: "2025-07-01",
    endDate: "2027-06-30",
    today,
  });
  const schedule = generateRentSchedule(lease({ financialTrackingStartDate: trackingStartDate }), today);
  assert.equal(schedule[0].periodMonth, "2026-03");
  assert.ok(schedule.every((item) => item.periodMonth >= "2026-03"));
});

test("F. ended historical-only lease creates no automatic charge", () => {
  const selection = getDefaultFinancialTrackingSelection("2025-07-01", "2026-06-30", today);
  assert.equal(selection.mode, "historical_only");
  assert.equal(resolveFinancialTrackingStartDate({ ...selection, startDate: "2025-07-01", endDate: "2026-06-30", today }), null);
  assert.deepEqual(generateRentSchedule(lease({ endDate: "2026-06-30", status: "ended", financialTrackingStartDate: null }), today), []);
});

test("G. ended lease can explicitly import its full financial history", () => {
  const schedule = generateRentSchedule(lease({ endDate: "2026-06-30", status: "ended", financialTrackingStartDate: "2025-07-01" }), today);
  assert.equal(schedule.length, 12);
  assert.equal(schedule[0].periodMonth, "2025-07");
  assert.equal(schedule.at(-1)?.periodMonth, "2026-06");
});

test("ledger remains duplicate-safe across generated and persisted charges", () => {
  const targetLease = lease({ financialTrackingStartDate: "2026-09-01" });
  const chargeId = getChargeId(targetLease.id, "2026-09");
  const ledger = buildRentLedger({
    ...emptyStore(),
    leases: [targetLease],
    rentCharges: [{
      id: chargeId,
      propertyId: targetLease.propertyId,
      unitId: targetLease.unitId,
      leaseId: targetLease.id,
      tenantId: targetLease.tenantId,
      periodMonth: "2026-09",
      dueDate: "2026-09-01",
      amountDue: 1200,
    }],
  }, today);

  assert.equal(ledger.rows.filter((row) => row.id === chargeId).length, 1);
});

test("normal, partial, paid, credit, multi-month and cancellation semantics remain intact", () => {
  const targetLease = lease({ financialTrackingStartDate: "2026-08-01" });
  const august = getChargeId(targetLease.id, "2026-08");
  const september = getChargeId(targetLease.id, "2026-09");
  const transactions: PaymentTransaction[] = [
    transaction("partial", 400),
    transaction("credit", 1400),
    { ...transaction("cancelled", 1200), cancelledAt: "2026-09-20T12:00:00.000Z" },
  ];
  const allocations: PaymentAllocation[] = [
    allocation("partial-allocation", "partial", august, 400),
    allocation("credit-allocation", "credit", september, 1400),
    allocation("cancelled-allocation", "cancelled", august, 1200),
  ];
  const ledger = buildRentLedger({ ...emptyStore(), leases: [targetLease], paymentTransactions: transactions, paymentAllocations: allocations }, today);
  const augustRow = ledger.rows.find((row) => row.id === august);
  const septemberRow = ledger.rows.find((row) => row.id === september);

  assert.equal(augustRow?.status, "partiel");
  assert.equal(augustRow?.balance, 800);
  assert.equal(augustRow?.transactionCount, 1);
  assert.equal(septemberRow?.status, "payé");
  assert.equal(septemberRow?.balance, 0);
  assert.equal(septemberRow?.credit, 200);
  assert.equal(new Set(ledger.rows.map((row) => row.id)).size, ledger.rows.length);
});

function lease(overrides: Partial<Lease> = {}): Lease {
  return {
    id: "lease-test",
    propertyId: "property-test",
    unitId: "unit-test",
    tenantId: "tenant-test",
    startDate: "2025-07-01",
    endDate: "2027-06-30",
    financialTrackingStartDate: "2025-07-01",
    monthlyRent: 1200,
    paymentStatus: "à venir",
    status: "active",
    ...overrides,
  };
}

function emptyStore(): LocalStore {
  return {
    activities: [], documents: [], leases: [], maintenanceTickets: [], notes: [], payments: [], paymentAllocations: [],
    paymentTransactions: [], properties: [], rentCharges: [], tasks: [], tenants: [], units: [],
  };
}

function transaction(id: string, amountReceived: number): PaymentTransaction {
  return {
    id,
    propertyId: "property-test",
    leaseId: "lease-test",
    tenantId: "tenant-test",
    receivedAt: "2026-09-20",
    amountReceived,
    method: "virement",
    reference: "",
    notes: "",
  };
}

function allocation(id: string, transactionId: string, rentChargeId: string, amountAllocated: number): PaymentAllocation {
  return { id, transactionId, rentChargeId, amountAllocated };
}

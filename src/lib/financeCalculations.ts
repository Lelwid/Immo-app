import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { buildRentLedger } from "@/lib/data/rentLedgerService";
import type { LocalStore } from "@/lib/types";

export type FinancePeriodFilter = "mois" | "12mois";

export type FinanceScope = {
  period?: FinancePeriodFilter;
  propertyId?: string;
};

export type FinanceSummary = {
  balanceDue: number;
  expected: number;
  expenses: number;
  latePayments: number;
  netCashflow: number;
  occupancyRate: number;
  received: number;
};

export type RevenueChartPoint = {
  expected: number;
  expenses: number;
  month: string;
  netCashflow: number;
  received: number;
};

export function getCurrentPaymentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function getFinancePeriodMonths(store: LocalStore, period: FinancePeriodFilter = "mois") {
  const currentMonth = getCurrentPaymentMonth();
  return period === "mois" ? [currentMonth] : getLastMonths(currentMonth, 12);
}

export function getScopedFinancePayments(store: LocalStore, scope: FinanceScope = {}) {
  const propertyId = scope.propertyId ?? "portfolio";
  const months = new Set(getFinancePeriodMonths(store, scope.period ?? "mois"));
  const ledger = buildRentLedger(store);

  return ledger.rows
    .filter(
      (charge) =>
        months.has(charge.periodMonth) &&
        (propertyId === "portfolio" || charge.propertyId === propertyId),
    )
    .map((charge) => ({
      id: `payment-view-${charge.id}`,
      propertyId: charge.propertyId,
      unitId: charge.unitId,
      leaseId: charge.leaseId,
      tenantId: charge.tenantId,
      month: charge.periodMonth,
      dueDate: charge.dueDate,
      amountDue: charge.amountDue,
      amountPaid: charge.amountAllocated,
      status: charge.status,
      paidAt: charge.lastPaymentAt,
      paymentType: "loyer" as const,
      notes: "",
    }));
}

export function getFinanceSummary(
  store: LocalStore,
  scope: FinanceScope = {},
  units: { id: string }[] = getScopedUnits(store, scope.propertyId ?? "portfolio"),
): FinanceSummary {
  const propertyId = scope.propertyId ?? "portfolio";
  const months = new Set(getFinancePeriodMonths(store, scope.period ?? "mois"));
  const ledger = buildRentLedger(store);
  const charges = ledger.rows.filter(
    (charge) =>
      months.has(charge.dueDate.slice(0, 7)) &&
      (propertyId === "portfolio" || charge.propertyId === propertyId),
  );
  const transactions = ledger.transactions.filter((transaction) => {
    const relatedCharge = ledger.rows.find((charge) =>
      ledger.allocations.some((allocation) => allocation.transactionId === transaction.id && allocation.rentChargeId === charge.id),
    );

    return (
      months.has(transaction.receivedAt.slice(0, 7)) &&
      (propertyId === "portfolio" || transaction.propertyId === propertyId || relatedCharge?.propertyId === propertyId)
    );
  });
  const expected = charges.reduce((sum, charge) => sum + charge.amountDue, 0);
  const received = transactions.reduce((sum, transaction) => sum + transaction.amountReceived, 0);
  const expenses = getRecordedExpenses();

  return {
    expected,
    received,
    expenses,
    balanceDue: charges.reduce((sum, charge) => sum + charge.balance, 0),
    occupancyRate: getOccupancyRate(units, store),
    latePayments: charges.filter((charge) => charge.status === "en retard").length,
    netCashflow: received - expenses,
  };
}

export function getRevenueChartData(store: LocalStore, scope: FinanceScope = {}): RevenueChartPoint[] {
  const propertyId = scope.propertyId ?? "portfolio";

  return getFinancePeriodMonths(store, scope.period ?? "mois").map((month) => {
    const ledger = buildRentLedger(store);
    const charges = ledger.rows.filter(
      (charge) =>
        charge.dueDate.slice(0, 7) === month &&
        (propertyId === "portfolio" || charge.propertyId === propertyId),
    );
    const transactions = ledger.transactions.filter(
      (transaction) =>
        transaction.receivedAt.slice(0, 7) === month &&
        (propertyId === "portfolio" || transaction.propertyId === propertyId),
    );
    const expected = charges.reduce((sum, charge) => sum + charge.amountDue, 0);
    const received = transactions.reduce((sum, transaction) => sum + transaction.amountReceived, 0);
    const expenses = getRecordedExpenses();

    return {
      month,
      expected,
      received,
      expenses,
      netCashflow: received - expenses,
    };
  });
}

export function getOccupancyRate(units: { id: string }[], store?: LocalStore) {
  if (!store || units.length === 0) {
    return 0;
  }

  return Math.round((units.filter((unit) => {
    const storeUnit = store.units.find((candidate) => candidate.id === unit.id);
    return storeUnit ? getUnitOccupancy(storeUnit, store.leases, store.tenants).isOccupied : false;
  }).length / units.length) * 100);
}

export function getLastMonths(currentMonth: string, count: number) {
  const [year, month] = currentMonth.split("-").map(Number);
  const months: string[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(year, month - 1 - index, 1);
    months.push(date.toISOString().slice(0, 7));
  }

  return months;
}

function getScopedUnits(store: LocalStore, propertyId: string) {
  return propertyId === "portfolio" ? store.units : store.units.filter((unit) => unit.propertyId === propertyId);
}

function getRecordedExpenses() {
  // No expense ledger exists yet. Net cashflow therefore uses only recorded
  // received payments and subtracts zero recorded expenses.
  return 0;
}

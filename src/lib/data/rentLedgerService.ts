import { shouldUseSupabase } from "@/lib/data/dataMode";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { getTodayIsoDate } from "@/lib/data/paymentSideEffectsService";
import { createPayment, updatePayment } from "@/lib/data/paymentsService";
import { computeRentChargeStatus } from "@/lib/data/rentStatus";
import { generateRentSchedule } from "@/lib/data/rentSchedule";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type {
  Lease,
  LocalStore,
  PaymentAllocation,
  PaymentMethod,
  PaymentRecord,
  PaymentTransaction,
  RentCharge,
  RentPaymentStatus,
} from "@/lib/types";

export type RentChargeRow = RentCharge & {
  anomalyReason?: string;
  amountAllocated: number;
  balance: number;
  credit: number;
  hasAnomaly: boolean;
  lastPaymentAt: string;
  status: RentPaymentStatus;
  transactionCount: number;
};

export type RentLedger = {
  charges: RentCharge[];
  transactions: PaymentTransaction[];
  allocations: PaymentAllocation[];
  rows: RentChargeRow[];
};

export type RentLedgerSummary = {
  currentMonth: string;
  dueThisMonth: number;
  receivedThisMonth: number;
  overdueBalance: number;
  remainingThisMonth: number;
  totalReceivable: number;
};

export type RecordPaymentInput = {
  chargeIds: string[];
  amountReceived: number;
  receivedAt: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
};

export type PaymentTransactionUpdateInput = {
  receivedAt: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
};

type SupabaseRentChargeRow = {
  id: string;
  property_id: string;
  unit_id: string;
  lease_id: string;
  tenant_id: string | null;
  period_month: string;
  due_date: string;
  amount_due: number | string;
  created_at?: string;
  updated_at?: string;
};

type SupabasePaymentTransactionRow = {
  id: string;
  property_id: string;
  lease_id: string | null;
  tenant_id: string | null;
  cancelled_at: string | null;
  received_at: string;
  amount_received: number | string;
  method: PaymentMethod | string | null;
  reference: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

type SupabasePaymentAllocationRow = {
  id: string;
  transaction_id: string;
  rent_charge_id: string;
  amount_allocated: number | string;
  created_at?: string;
};

const rentChargesTable = "rent_charges";
const paymentTransactionsTable = "payment_transactions";
const paymentAllocationsTable = "payment_allocations";

export async function getRentLedger(store: LocalStore): Promise<RentLedger> {
  return buildRentLedger({
    ...store,
    rentCharges: await getRentCharges(),
    paymentTransactions: await getPaymentTransactions(),
    paymentAllocations: await getPaymentAllocations(),
  });
}

export async function getRentCharges(): Promise<RentCharge[]> {
  if (!canUseSupabase()) {
    return loadLocalStore().rentCharges;
  }

  const { data, error } = await supabase!
    .from(rentChargesTable)
    .select(rentChargeSelectColumns)
    .order("due_date", { ascending: false });

  if (error || !data) {
    console.error("Impossible de charger les loyers exigibles.", error);
    throw new Error("Impossible de charger les loyers exigibles.");
  }

  return data.map(fromSupabaseRentCharge);
}

export async function getPaymentTransactions(): Promise<PaymentTransaction[]> {
  if (!canUseSupabase()) {
    return loadLocalStore().paymentTransactions;
  }

  const { data, error } = await supabase!
    .from(paymentTransactionsTable)
    .select(paymentTransactionSelectColumns)
    .order("received_at", { ascending: false });

  if (error || !data) {
    console.error("Impossible de charger les transactions de paiement.", error);
    throw new Error("Impossible de charger les transactions de paiement.");
  }

  return data.map(fromSupabasePaymentTransaction);
}

export async function getPaymentAllocations(): Promise<PaymentAllocation[]> {
  if (!canUseSupabase()) {
    return loadLocalStore().paymentAllocations;
  }

  const { data, error } = await supabase!.from(paymentAllocationsTable).select(paymentAllocationSelectColumns);

  if (error || !data) {
    console.error("Impossible de charger les répartitions de paiement.", error);
    throw new Error("Impossible de charger les répartitions de paiement.");
  }

  return data.map(fromSupabasePaymentAllocation);
}

export async function updatePaymentTransaction(
  transactionId: string,
  input: PaymentTransactionUpdateInput,
): Promise<PaymentTransaction> {
  if (!input.receivedAt) {
    throw new Error("La date de réception est obligatoire.");
  }

  if (input.receivedAt > getTodayIsoDate()) {
    throw new Error("La date de réception ne peut pas être dans le futur.");
  }

  const update = {
    received_at: input.receivedAt,
    method: input.method,
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(paymentTransactionsTable)
      .update(update)
      .eq("id", transactionId)
      .is("cancelled_at", null)
      .select(paymentTransactionSelectColumns)
      .single();

    if (error || !data) {
      throw new Error("Impossible de corriger la transaction.");
    }

    return fromSupabasePaymentTransaction(data);
  }

  const store = loadLocalStore();
  const existing = store.paymentTransactions.find((transaction) => transaction.id === transactionId);

  if (!existing) {
    throw new Error("Impossible de corriger la transaction.");
  }

  const nextTransaction: PaymentTransaction = {
    ...existing,
    receivedAt: input.receivedAt,
    method: input.method,
    reference: input.reference?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    updatedAt: new Date().toISOString(),
  };

  saveLocalStore({
    ...store,
    paymentTransactions: store.paymentTransactions.map((transaction) =>
      transaction.id === transactionId ? nextTransaction : transaction,
    ),
  });

  return nextTransaction;
}

export async function cancelPaymentTransaction(transactionId: string): Promise<void> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(paymentTransactionsTable)
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", transactionId)
      .is("cancelled_at", null)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error("Impossible d’annuler la transaction.");
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({
    ...store,
    paymentTransactions: store.paymentTransactions.map((transaction) =>
      transaction.id === transactionId ? { ...transaction, cancelledAt: new Date().toISOString() } : transaction,
    ),
  });
}

export function buildRentLedger(store: LocalStore, today = getTodayIsoDate()): RentLedger {
  const generatedCharges = generateRentCharges(store.leases, today);
  const legacyCharges = createLegacyCharges(store.payments, store.leases);
  const explicitChargeIds = new Set(store.rentCharges.map((charge) => charge.id));
  const charges = dedupeById([...generatedCharges, ...legacyCharges, ...store.rentCharges]).map((charge) =>
    normalizeChargeLeaseRelations(charge, store.leases),
  );
  const chargesWithExplicitAllocations = new Set(store.paymentAllocations.map((allocation) => allocation.rentChargeId));
  const legacyLedger = createLegacyTransactionsAndAllocations(store.payments, explicitChargeIds, chargesWithExplicitAllocations);
  const transactions = dedupeById([...legacyLedger.transactions, ...store.paymentTransactions]);
  const allocations = dedupeById([...legacyLedger.allocations, ...store.paymentAllocations]);
  const activeTransactions = transactions.filter((transaction) => !transaction.cancelledAt);
  const activeTransactionIds = new Set(activeTransactions.map((transaction) => transaction.id));
  const activeAllocations = allocations.filter((allocation) => activeTransactionIds.has(allocation.transactionId));
  const rows = charges.map((charge) => toChargeRow(charge, activeTransactions, activeAllocations, store.leases, store.tenants, today)).sort(compareChargeRows);

  return {
    charges,
    transactions,
    allocations,
    rows,
  };
}

export function getRentLedgerSummary(ledger: RentLedger, month = getTodayIsoDate().slice(0, 7), today = getTodayIsoDate()): RentLedgerSummary {
  const chargesDueThisMonth = ledger.rows.filter((charge) => charge.dueDate.slice(0, 7) === month);
  const transactionsThisMonth = ledger.transactions.filter((transaction) => !transaction.cancelledAt && transaction.receivedAt.slice(0, 7) === month);

  return {
    currentMonth: month,
    dueThisMonth: chargesDueThisMonth.reduce((sum, charge) => sum + charge.amountDue, 0),
    receivedThisMonth: transactionsThisMonth.reduce((sum, transaction) => sum + transaction.amountReceived, 0),
    overdueBalance: ledger.rows
      .filter((charge) => charge.dueDate < today && charge.balance > 0)
      .reduce((sum, charge) => sum + charge.balance, 0),
    remainingThisMonth: chargesDueThisMonth.reduce((sum, charge) => sum + Math.max(0, charge.balance), 0),
    totalReceivable: ledger.rows.reduce((sum, charge) => sum + Math.max(0, charge.balance), 0),
  };
}

export async function recordPaymentTransaction(store: LocalStore, input: RecordPaymentInput): Promise<LocalStore> {
  const ledger = buildRentLedger(store);
  const selectedRows = input.chargeIds
    .map((chargeId) => ledger.rows.find((row) => row.id === chargeId))
    .filter((row): row is RentChargeRow => Boolean(row))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (selectedRows.length === 0) {
    throw new Error("Sélectionnez au moins un loyer à appliquer.");
  }

  if (input.amountReceived <= 0) {
    throw new Error("Le montant reçu doit être supérieur à 0 $.");
  }

  if (!input.receivedAt) {
    throw new Error("La date de réception est obligatoire.");
  }

  if (input.receivedAt > getTodayIsoDate()) {
    throw new Error("La date de réception ne peut pas être dans le futur.");
  }

  const firstCharge = selectedRows[0];
  const transaction: PaymentTransaction = {
    id: createStableId("payment-transaction"),
    propertyId: firstCharge.propertyId,
    leaseId: firstCharge.leaseId,
    tenantId: firstCharge.tenantId,
    receivedAt: input.receivedAt,
    amountReceived: input.amountReceived,
    method: input.method,
    reference: input.reference?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const allocations = allocatePayment(transaction.id, selectedRows, input.amountReceived);

  if (canUseSupabase()) {
    await persistRentLedgerToSupabase(selectedRows, transaction, allocations);
  }

  const nextStore = buildStoreWithLedgerPayment(store, selectedRows, transaction, allocations);
  const compatibilityPayments = getCompatibilityPaymentsForRows(nextStore, selectedRows);

  saveLocalStore(nextStore);
  await Promise.all(compatibilityPayments.map((payment) => upsertCompatibilityPayment(payment)));

  try {
    await createActivityRecord({
      propertyId: firstCharge.propertyId,
      unitId: firstCharge.unitId,
      tenantId: firstCharge.tenantId,
      leaseId: firstCharge.leaseId,
      date: input.receivedAt,
      type: "paiement",
      title: "Paiement enregistré",
      description: `Encaissement de ${input.amountReceived.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })} appliqué à ${selectedRows.length} loyer${selectedRows.length > 1 ? "s" : ""}.`,
    });
  } catch (error) {
    console.error("Impossible de créer l'activité de paiement.", error);
  }

  return nextStore;
}

export function getChargeStatus(charge: RentCharge, amountAllocated: number, today = getTodayIsoDate()): RentPaymentStatus {
  return computeRentChargeStatus({
    amountAllocated,
    amountDue: charge.amountDue,
    dueDate: charge.dueDate,
    today,
  });
}

export function getChargeId(leaseId: string, periodMonth: string) {
  return `rent-charge-${leaseId}-${periodMonth}`;
}

function buildStoreWithLedgerPayment(
  store: LocalStore,
  selectedRows: RentChargeRow[],
  transaction: PaymentTransaction,
  allocations: PaymentAllocation[],
): LocalStore {
  const chargeIds = new Set(selectedRows.map((charge) => charge.id));
  const nextCharges = dedupeById([...store.rentCharges, ...selectedRows.map(toRentCharge)]);
  const nextTransactions = [...store.paymentTransactions, transaction];
  const nextAllocations = [...store.paymentAllocations, ...allocations];
  const nextLedger = buildRentLedger({
    ...store,
    rentCharges: nextCharges,
    paymentTransactions: nextTransactions,
    paymentAllocations: nextAllocations,
  });
  const compatiblePayments = selectedRows.map((charge) =>
    toCompatibilityPayment(
      nextLedger.rows.find((row) => row.id === charge.id) ?? charge,
      nextLedger.transactions,
      nextLedger.allocations,
    ),
  );

  return {
    ...store,
    rentCharges: nextCharges,
    paymentTransactions: nextTransactions,
    paymentAllocations: nextAllocations,
    payments: [
      ...store.payments.filter((payment) => !payment.leaseId || !chargeIds.has(getChargeId(payment.leaseId, payment.month))),
      ...compatiblePayments,
    ].sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
  };
}

function getCompatibilityPaymentsForRows(store: LocalStore, selectedRows: RentChargeRow[]) {
  const ledger = buildRentLedger(store);

  return selectedRows
    .map((charge) => ledger.rows.find((row) => row.id === charge.id))
    .filter((row): row is RentChargeRow => Boolean(row))
    .map((row) => toCompatibilityPayment(row, ledger.transactions, ledger.allocations));
}

async function upsertCompatibilityPayment(payment: PaymentRecord) {
  try {
    const store = loadLocalStore();
    const existingPayment = store.payments.find((candidate) => candidate.id === payment.id);
    if (existingPayment) {
      await updatePayment(existingPayment.id, payment);
    } else {
      await createPayment(payment);
    }
  } catch (error) {
    console.error("Impossible de synchroniser le paiement de compatibilité.", error);
  }
}

function toCompatibilityPayment(
  charge: RentChargeRow,
  transactions: PaymentTransaction[],
  allocations: PaymentAllocation[],
): PaymentRecord {
  const chargeAllocations = allocations.filter((allocation) => allocation.rentChargeId === charge.id);
  const lastPaymentAt = getLastPaymentAt(chargeAllocations, transactions);

  return {
    id: `payment-compat-${charge.id}`,
    propertyId: charge.propertyId,
    unitId: charge.unitId,
    leaseId: charge.leaseId,
    tenantId: charge.tenantId,
    month: charge.periodMonth,
    dueDate: charge.dueDate,
    amountDue: charge.amountDue,
    amountPaid: charge.amountAllocated,
    status: charge.status,
    paidAt: lastPaymentAt,
    paymentType: "loyer",
    notes: "Synchronisé depuis le registre des loyers.",
  };
}

function generateRentCharges(leases: Lease[], today: string): RentCharge[] {
  return leases.flatMap((lease) => {
    return generateRentSchedule(lease, today).map(({ dueDate, periodMonth }) => ({
          id: getChargeId(lease.id, periodMonth),
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          leaseId: lease.id,
          tenantId: lease.tenantId,
          periodMonth,
          dueDate,
          amountDue: lease.monthlyRent,
          createdAt: lease.createdAt,
          updatedAt: lease.updatedAt,
        }));
  });
}

function createLegacyCharges(payments: PaymentRecord[], leases: Lease[]): RentCharge[] {
  return payments
    .filter((payment) => Boolean(payment.leaseId))
    .map((payment) => {
      const lease = leases.find((candidate) => candidate.id === payment.leaseId);

      return {
        id: getChargeId(payment.leaseId as string, payment.month),
        propertyId: lease?.propertyId ?? payment.propertyId,
        unitId: lease?.unitId ?? payment.unitId,
        leaseId: payment.leaseId as string,
        tenantId: payment.tenantId ?? lease?.tenantId ?? null,
        periodMonth: payment.month,
        dueDate: payment.dueDate,
        amountDue: payment.amountDue,
        createdAt: `${payment.dueDate}T12:00:00.000Z`,
        updatedAt: `${payment.dueDate}T12:00:00.000Z`,
      };
    });
}

function createLegacyTransactionsAndAllocations(
  payments: PaymentRecord[],
  explicitChargeIds: Set<string>,
  chargesWithExplicitAllocations: Set<string>,
) {
  const transactions: PaymentTransaction[] = [];
  const allocations: PaymentAllocation[] = [];

  payments.forEach((payment) => {
    if (!payment.leaseId || payment.amountPaid <= 0) {
      return;
    }

    const chargeId = getChargeId(payment.leaseId, payment.month);

    if (explicitChargeIds.has(chargeId) || chargesWithExplicitAllocations.has(chargeId)) {
      return;
    }

    const transactionId = `legacy-payment-transaction-${payment.id}`;
    transactions.push({
      id: transactionId,
      propertyId: payment.propertyId,
      leaseId: payment.leaseId,
      tenantId: payment.tenantId,
      receivedAt: payment.paidAt || payment.dueDate,
      amountReceived: payment.amountPaid,
      method: "virement",
      reference: "",
      notes: payment.notes,
      createdAt: `${payment.paidAt || payment.dueDate}T12:00:00.000Z`,
      updatedAt: `${payment.paidAt || payment.dueDate}T12:00:00.000Z`,
    });
    allocations.push({
      id: `legacy-payment-allocation-${payment.id}`,
      transactionId,
      rentChargeId: chargeId,
      amountAllocated: payment.amountPaid,
      createdAt: `${payment.paidAt || payment.dueDate}T12:00:00.000Z`,
    });
  });

  return { transactions, allocations };
}

function allocatePayment(transactionId: string, charges: RentChargeRow[], amountReceived: number): PaymentAllocation[] {
  let remaining = amountReceived;

  return charges.flatMap((charge, index) => {
    if (remaining <= 0) {
      return [];
    }

    const isLastCharge = index === charges.length - 1;
    const targetBalance = Math.max(0, charge.balance);
    const amountAllocated = isLastCharge ? remaining : Math.min(remaining, targetBalance);

    remaining -= amountAllocated;

    return [{
      id: createStableId("payment-allocation"),
      transactionId,
      rentChargeId: charge.id,
      amountAllocated,
      createdAt: new Date().toISOString(),
    }];
  });
}

async function persistRentLedgerToSupabase(
  charges: RentChargeRow[],
  transaction: PaymentTransaction,
  allocations: PaymentAllocation[],
) {
  const { error } = await supabase!.rpc("record_rent_payment", {
    p_transaction: toSupabasePaymentTransaction(transaction),
    p_charges: charges.map((charge) => toSupabaseRentCharge(toRentCharge(charge))),
    p_allocations: allocations.map(toSupabasePaymentAllocation),
  });

  if (error) {
    console.error("Impossible d'enregistrer le paiement.", error);
    throw new Error("Impossible d'appliquer le paiement aux loyers.");
  }
}

function toChargeRow(
  charge: RentCharge,
  transactions: PaymentTransaction[],
  allocations: PaymentAllocation[],
  leases: Lease[],
  tenants: { id: string; archivedAt?: string | null }[],
  today: string,
): RentChargeRow {
  const lease = leases.find((candidate) => candidate.id === charge.leaseId);
  const tenantId = charge.tenantId ?? lease?.tenantId ?? null;
  const tenant = tenantId ? tenants.find((candidate) => candidate.id === tenantId) : null;
  const chargeAllocations = allocations.filter((allocation) => allocation.rentChargeId === charge.id);
  const amountAllocated = chargeAllocations.reduce((sum, allocation) => sum + allocation.amountAllocated, 0);
  const balance = Math.max(0, charge.amountDue - amountAllocated);
  const credit = Math.max(0, amountAllocated - charge.amountDue);
  const anomalyReason = getChargeAnomalyReason(charge, lease, tenant);

  return {
    ...charge,
    tenantId,
    anomalyReason,
    amountAllocated,
    balance,
    credit,
    hasAnomaly: Boolean(anomalyReason),
    lastPaymentAt: getLastPaymentAt(chargeAllocations, transactions),
    status: getChargeStatus(charge, amountAllocated, today),
    transactionCount: chargeAllocations.length,
  };
}

function normalizeChargeLeaseRelations(charge: RentCharge, leases: Lease[]): RentCharge {
  const lease = leases.find((candidate) => candidate.id === charge.leaseId);

  if (!lease) {
    return charge;
  }

  return {
    ...charge,
    propertyId: lease.propertyId,
    unitId: lease.unitId,
    tenantId: charge.tenantId ?? lease.tenantId,
  };
}

function getChargeAnomalyReason(
  charge: RentCharge,
  lease: Lease | undefined,
  tenant: { id: string; archivedAt?: string | null } | undefined | null,
) {
  if (!lease) {
    return "Bail lié introuvable";
  }

  if (charge.propertyId !== lease.propertyId || charge.unitId !== lease.unitId) {
    return "Le loyer ne correspond pas au logement du bail";
  }

  if (lease.actualEndDate && charge.dueDate > lease.actualEndDate) {
    return "Loyer généré après la fin réelle du bail";
  }

  if (lease.status === "ended" && charge.dueDate > (lease.actualEndDate || lease.endDate)) {
    return "Loyer généré après la fin du bail";
  }

  if (!charge.tenantId || !tenant) {
    return "Locataire lié introuvable";
  }

  if (tenant.archivedAt && lease.status === "active") {
    return "Locataire archivé sur un bail actif";
  }

  return "";
}

function getLastPaymentAt(allocations: PaymentAllocation[], transactions: PaymentTransaction[]) {
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  return allocations
    .map((allocation) => transactionById.get(allocation.transactionId)?.receivedAt ?? "")
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
}

function toRentCharge(charge: RentCharge): RentCharge {
  return {
    id: charge.id,
    propertyId: charge.propertyId,
    unitId: charge.unitId,
    leaseId: charge.leaseId,
    tenantId: charge.tenantId,
    periodMonth: charge.periodMonth,
    dueDate: charge.dueDate,
    amountDue: charge.amountDue,
    createdAt: charge.createdAt,
    updatedAt: charge.updatedAt,
  };
}

function compareChargeRows(a: RentChargeRow, b: RentChargeRow) {
  return b.periodMonth.localeCompare(a.periodMonth) || a.dueDate.localeCompare(b.dueDate);
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function createStableId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

const rentChargeSelectColumns =
  "id,property_id,unit_id,lease_id,tenant_id,period_month,due_date,amount_due,created_at,updated_at";
const paymentTransactionSelectColumns =
  "id,property_id,lease_id,tenant_id,cancelled_at,received_at,amount_received,method,reference,notes,created_at,updated_at";
const paymentAllocationSelectColumns =
  "id,transaction_id,rent_charge_id,amount_allocated,created_at";

function fromSupabaseRentCharge(row: SupabaseRentChargeRow): RentCharge {
  return {
    id: row.id,
    propertyId: row.property_id,
    unitId: row.unit_id,
    leaseId: row.lease_id,
    tenantId: row.tenant_id,
    periodMonth: row.period_month,
    dueDate: row.due_date,
    amountDue: Number(row.amount_due ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromSupabasePaymentTransaction(row: SupabasePaymentTransactionRow): PaymentTransaction {
  return {
    id: row.id,
    propertyId: row.property_id,
    leaseId: row.lease_id,
    tenantId: row.tenant_id,
    cancelledAt: row.cancelled_at,
    receivedAt: row.received_at,
    amountReceived: Number(row.amount_received ?? 0),
    method: normalizePaymentMethod(row.method),
    reference: row.reference ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromSupabasePaymentAllocation(row: SupabasePaymentAllocationRow): PaymentAllocation {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    rentChargeId: row.rent_charge_id,
    amountAllocated: Number(row.amount_allocated ?? 0),
    createdAt: row.created_at,
  };
}

function toSupabaseRentCharge(charge: RentCharge) {
  return {
    id: charge.id,
    property_id: charge.propertyId,
    unit_id: charge.unitId,
    lease_id: charge.leaseId,
    tenant_id: charge.tenantId,
    period_month: charge.periodMonth,
    due_date: charge.dueDate,
    amount_due: charge.amountDue,
  };
}

function toSupabasePaymentTransaction(transaction: PaymentTransaction) {
  return {
    id: transaction.id,
    property_id: transaction.propertyId,
    lease_id: transaction.leaseId ?? null,
    tenant_id: transaction.tenantId,
    received_at: transaction.receivedAt,
    amount_received: transaction.amountReceived,
    method: transaction.method,
    reference: transaction.reference?.trim() || null,
    notes: transaction.notes?.trim() || null,
  };
}

function toSupabasePaymentAllocation(allocation: PaymentAllocation) {
  return {
    id: allocation.id,
    transaction_id: allocation.transactionId,
    rent_charge_id: allocation.rentChargeId,
    amount_allocated: allocation.amountAllocated,
  };
}

function normalizePaymentMethod(method: string | null | undefined): PaymentMethod {
  if (method === "virement" || method === "interac" || method === "cheque" || method === "especes" || method === "carte" || method === "autre") {
    return method;
  }

  return "virement";
}

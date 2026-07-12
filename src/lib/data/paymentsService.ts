import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { PaymentRecord, PaymentType, RentPaymentStatus } from "@/lib/types";

const table = "payments";

type SupabasePaymentRow = {
  id: string;
  user_id: string;
  property_id: string;
  unit_id: string | null;
  lease_id: string | null;
  tenant_id: string | null;
  amount: number | string;
  amount_paid: number | string | null;
  due_date: string;
  paid_date: string | null;
  status: string | null;
  payment_type: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PaymentInput = {
  id?: string;
  propertyId: string;
  unitId: string;
  leaseId?: string | null;
  tenantId?: string | null;
  dueDate: string;
  amountDue: number;
  amountPaid?: number;
  status?: RentPaymentStatus;
  paidAt?: string;
  paymentType?: PaymentType;
  notes?: string;
};

export type PaymentUpdateInput = Partial<Omit<PaymentInput, "propertyId" | "unitId" | "leaseId" | "tenantId" | "dueDate">> &
  Partial<Pick<PaymentInput, "propertyId" | "unitId" | "leaseId" | "tenantId" | "dueDate">>;

const loadError = "Impossible de charger les paiements.";
const createError = "Impossible de créer le paiement.";
const updateError = "Impossible de modifier le paiement.";
const deleteError = "Impossible de supprimer le paiement.";

export async function getPayments(): Promise<PaymentRecord[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .order("due_date", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortPayments(loadLocalStore().payments);
}

export async function getPaymentsForProperty(propertyId: string): Promise<PaymentRecord[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("property_id", propertyId)
      .order("due_date", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortPayments(loadLocalStore().payments.filter((payment) => payment.propertyId === propertyId));
}

export async function getPaymentsForUnit(unitId: string): Promise<PaymentRecord[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("unit_id", unitId)
      .order("due_date", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortPayments(loadLocalStore().payments.filter((payment) => payment.unitId === unitId));
}

export async function getPaymentsForLease(leaseId: string): Promise<PaymentRecord[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("lease_id", leaseId)
      .order("due_date", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortPayments(loadLocalStore().payments.filter((payment) => payment.leaseId === leaseId));
}

export async function createPayment(input: PaymentInput): Promise<PaymentRecord> {
  const paymentInput = normalizePaymentInput(input);

  if (canUseSupabase()) {
    const userId = await getCurrentUserId(createError);
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(paymentInput, userId))
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const payment: PaymentRecord = {
    ...paymentInput,
    id: paymentInput.id || createLocalPaymentId(),
    month: paymentInput.dueDate.slice(0, 7),
  };

  saveLocalStore({
    ...store,
    payments: [...store.payments, payment],
  });

  return payment;
}

export async function updatePayment(paymentId: string, input: PaymentUpdateInput): Promise<PaymentRecord> {
  if (canUseSupabase()) {
    const existing = await getPaymentById(paymentId, updateError);
    const nextInput = normalizePaymentInput({ ...existing, ...input });
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabaseUpdate(nextInput))
      .eq("id", paymentId)
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existing = store.payments.find((payment) => payment.id === paymentId);

  if (!existing) {
    throw new Error(updateError);
  }

  const nextPayment = normalizePaymentRecord({
    ...existing,
    ...input,
    id: paymentId,
  });

  saveLocalStore({
    ...store,
    payments: store.payments.map((payment) => (payment.id === paymentId ? nextPayment : payment)),
  });

  return nextPayment;
}

export async function deletePayment(paymentId: string): Promise<void> {
  if (canUseSupabase()) {
    const { error } = await supabase!.from(table).delete().eq("id", paymentId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({
    ...store,
    payments: store.payments.filter((payment) => payment.id !== paymentId),
  });
}

export async function listPayments(unitId?: string): Promise<PaymentRecord[]> {
  return unitId ? getPaymentsForUnit(unitId) : getPayments();
}

export async function upsertPayment(payment: PaymentRecord) {
  const existingPayments = await getPayments();
  const existing = existingPayments.find((candidate) => candidate.id === payment.id);

  return existing ? updatePayment(payment.id, payment) : createPayment(payment);
}

const selectColumns =
  "id,user_id,property_id,unit_id,lease_id,tenant_id,amount,amount_paid,due_date,paid_date,status,payment_type,notes,created_at,updated_at";

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

async function getCurrentUserId(errorMessage: string) {
  const { data, error } = await supabase!.auth.getUser();

  if (error || !data.user?.id) {
    throw new Error(errorMessage);
  }

  return data.user.id;
}

async function getPaymentById(paymentId: string, errorMessage: string): Promise<PaymentRecord> {
  const { data, error } = await supabase!.from(table).select(selectColumns).eq("id", paymentId).single();

  if (error || !data) {
    throw new Error(errorMessage);
  }

  return fromSupabaseRow(data);
}

function fromSupabaseRow(row: SupabasePaymentRow): PaymentRecord {
  const dueDate = row.due_date;

  return {
    id: row.id,
    propertyId: row.property_id,
    unitId: row.unit_id ?? "",
    leaseId: row.lease_id,
    tenantId: row.tenant_id,
    month: dueDate.slice(0, 7),
    dueDate,
    amountDue: Number(row.amount ?? 0),
    amountPaid: Number(row.amount_paid ?? 0),
    status: normalizeRentPaymentStatus(row.status),
    paidAt: row.paid_date ?? "",
    paymentType: normalizePaymentType(row.payment_type),
    notes: row.notes ?? "",
  };
}

function toSupabaseInsert(input: Required<PaymentInput>, userId: string) {
  return {
    user_id: userId,
    property_id: input.propertyId,
    unit_id: input.unitId || null,
    lease_id: input.leaseId || null,
    tenant_id: input.tenantId || null,
    amount: input.amountDue,
    amount_paid: input.amountPaid,
    due_date: input.dueDate,
    paid_date: input.paidAt || null,
    status: input.status,
    payment_type: input.paymentType,
    notes: input.notes?.trim() || null,
  };
}

function toSupabaseUpdate(input: Required<PaymentInput>) {
  return {
    property_id: input.propertyId,
    unit_id: input.unitId || null,
    lease_id: input.leaseId || null,
    tenant_id: input.tenantId || null,
    amount: input.amountDue,
    amount_paid: input.amountPaid,
    due_date: input.dueDate,
    paid_date: input.paidAt || null,
    status: input.status,
    payment_type: input.paymentType,
    notes: input.notes?.trim() || null,
  };
}

function normalizePaymentInput(input: PaymentInput): Required<PaymentInput> {
  return {
    propertyId: input.propertyId,
    id: input.id ?? "",
    unitId: input.unitId,
    leaseId: input.leaseId ?? null,
    tenantId: input.tenantId ?? null,
    dueDate: input.dueDate,
    amountDue: Number(input.amountDue || 0),
    amountPaid: Number(input.amountPaid || 0),
    status: input.status ?? "à venir",
    paidAt: input.paidAt ?? "",
    paymentType: input.paymentType ?? "loyer",
    notes: input.notes ?? "",
  };
}

function normalizePaymentRecord(payment: PaymentRecord): PaymentRecord {
  return {
    ...payment,
    leaseId: payment.leaseId ?? null,
    tenantId: payment.tenantId ?? null,
    month: payment.dueDate.slice(0, 7),
    amountDue: Number(payment.amountDue || 0),
    amountPaid: Number(payment.amountPaid || 0),
    status: normalizeRentPaymentStatus(payment.status),
    paidAt: payment.paidAt ?? "",
    paymentType: normalizePaymentType(payment.paymentType),
    notes: payment.notes ?? "",
  };
}

function normalizeRentPaymentStatus(status: string | null | undefined): RentPaymentStatus {
  if (status === "payé" || status === "partiel" || status === "en retard" || status === "à venir") {
    return status;
  }

  return "à venir";
}

function normalizePaymentType(type: string | null | undefined): PaymentType {
  if (type === "loyer" || type === "frais" || type === "dépôt" || type === "autre") {
    return type;
  }

  return "loyer";
}

function sortPayments(payments: PaymentRecord[]) {
  return [...payments].map(normalizePaymentRecord).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

function createLocalPaymentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `payment-${crypto.randomUUID()}`;
  }

  return `payment-${Date.now()}`;
}

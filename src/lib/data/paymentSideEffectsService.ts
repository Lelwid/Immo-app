import { createPayment, updatePayment } from "@/lib/data/paymentsService";
import type { LocalStore, PaymentRecord, PaymentStatus, RentPaymentStatus } from "@/lib/types";

type InitialPaymentInput = {
  propertyId: string;
  unitId: string;
  leaseId?: string | null;
  tenantId: string;
  leaseStartDate: string;
  rent: number;
  paymentStatus: PaymentStatus;
};

export async function applyInitialPaymentSideEffect(store: LocalStore, input: InitialPaymentInput): Promise<LocalStore> {
  return runPaymentSideEffect(store, async () => {
    const payment = createInitialPayment(input);
    const existingPayment = store.payments.find((candidate) =>
      input.leaseId
        ? candidate.leaseId === input.leaseId && candidate.month === payment.month
        : candidate.unitId === input.unitId && candidate.month === payment.month,
    );
    const savedPayment = existingPayment
      ? await updatePayment(existingPayment.id, payment)
      : await createPayment(payment);

    return {
      ...store,
      payments: upsertPayment(store.payments, savedPayment),
    };
  }, "Impossible de créer le paiement initial.");
}

async function runPaymentSideEffect(store: LocalStore, effect: () => Promise<LocalStore>, errorMessage: string) {
  try {
    return await effect();
  } catch (error) {
    console.error(errorMessage, error);
    return store;
  }
}

function createInitialPayment({
  leaseStartDate,
  leaseId,
  paymentStatus,
  propertyId,
  rent,
  tenantId,
  unitId,
}: InitialPaymentInput): PaymentRecord {
  const rentPaymentStatus = toRentPaymentStatus(paymentStatus);

  return {
    id: createLocalId("payment"),
    propertyId,
    unitId,
    leaseId: leaseId ?? null,
    tenantId,
    month: leaseStartDate.slice(0, 7),
    dueDate: leaseStartDate,
    amountDue: rent,
    amountPaid: paymentStatus === "paid" ? rent : 0,
    status: rentPaymentStatus,
    paidAt: paymentStatus === "paid" ? leaseStartDate : "",
    paymentType: "loyer",
    notes: "Créé lors de l'ajout du locataire.",
  };
}

function toRentPaymentStatus(status: PaymentStatus): RentPaymentStatus {
  if (status === "paid") {
    return "payé";
  }

  if (status === "late") {
    return "en retard";
  }

  return "à venir";
}

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function upsertPayment(payments: PaymentRecord[], payment: PaymentRecord) {
  return payments.some((candidate) => candidate.id === payment.id)
    ? payments.map((candidate) => (candidate.id === payment.id ? payment : candidate))
    : [...payments, payment];
}

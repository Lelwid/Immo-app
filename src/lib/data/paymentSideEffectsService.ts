import { createPayment, updatePayment } from "@/lib/data/paymentsService";
import { getDueDateForPeriod } from "@/lib/data/rentSchedule";
import type { LocalStore, PaymentRecord, PaymentStatus, RentPaymentStatus } from "@/lib/types";

export type InitialPaymentStatus = PaymentStatus | "partial";

export type InitialPaymentInput = {
  propertyId: string;
  unitId: string;
  leaseId?: string | null;
  tenantId: string;
  leaseStartDate: string;
  financialTrackingStartDate?: string | null;
  rent: number;
  paymentStatus: InitialPaymentStatus;
  initialAmountPaid?: number;
  paymentReceivedDate?: string;
};

export async function applyInitialPaymentSideEffect(store: LocalStore, input: InitialPaymentInput): Promise<LocalStore> {
  if (input.financialTrackingStartDate === null) {
    return store;
  }

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

export function createInitialPayment({
  leaseStartDate,
  financialTrackingStartDate,
  leaseId,
  initialAmountPaid,
  paymentReceivedDate,
  paymentStatus,
  propertyId,
  rent,
  tenantId,
  unitId,
}: InitialPaymentInput): PaymentRecord {
  if (financialTrackingStartDate === null) {
    throw new Error("Aucun paiement initial ne peut être créé pour un bail historique sans suivi financier.");
  }

  const trackingStartDate = financialTrackingStartDate ?? leaseStartDate;
  const trackingPeriod = trackingStartDate.slice(0, 7);
  const rentPaymentStatus = toRentPaymentStatus(paymentStatus);
  const paidAt = resolveInitialPaymentReceivedDate(paymentStatus, paymentReceivedDate);
  const amountPaid = resolveInitialAmountPaid(paymentStatus, rent, initialAmountPaid);

  return {
    id: createLocalId("payment"),
    propertyId,
    unitId,
    leaseId: leaseId ?? null,
    tenantId,
    month: trackingPeriod,
    dueDate: getDueDateForPeriod(leaseStartDate, trackingPeriod),
    amountDue: rent,
    amountPaid,
    status: rentPaymentStatus,
    paidAt,
    paymentType: "loyer",
    notes: "Créé lors de l'ajout du locataire.",
  };
}

function toRentPaymentStatus(status: InitialPaymentStatus): RentPaymentStatus {
  if (status === "paid") {
    return "payé";
  }

  if (status === "partial") {
    return "partiel";
  }

  if (status === "late") {
    return "en retard";
  }

  return "à venir";
}

export function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function resolveInitialPaymentReceivedDate(status: InitialPaymentStatus, paymentReceivedDate?: string) {
  if (status !== "paid" && status !== "partial") {
    return "";
  }

  const receivedDate = paymentReceivedDate || getTodayIsoDate();

  if (receivedDate > getTodayIsoDate()) {
    throw new Error("La date de réception du paiement ne peut pas être dans le futur.");
  }

  return receivedDate;
}

function resolveInitialAmountPaid(status: InitialPaymentStatus, rent: number, initialAmountPaid?: number) {
  if (status === "paid") {
    return rent;
  }

  if (status === "partial") {
    const amountPaid = Number(initialAmountPaid ?? 0);

    if (amountPaid <= 0 || amountPaid >= rent) {
      throw new Error("Un paiement partiel doit être supérieur à 0 $ et inférieur au loyer dû.");
    }

    return amountPaid;
  }

  return 0;
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

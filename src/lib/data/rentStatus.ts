import type { PaymentAllocation, PaymentStatus, RentCharge, RentPaymentStatus } from "@/lib/types";

export type ComputedRentChargeStatusInput = {
  amountDue: number;
  amountAllocated: number;
  dueDate: string;
  today: string;
};

export function computeRentChargeStatus({
  amountAllocated,
  amountDue,
  dueDate,
  today,
}: ComputedRentChargeStatusInput): RentPaymentStatus {
  const remainingBalance = getRemainingRentBalance(amountDue, amountAllocated);

  if (remainingBalance <= 0) {
    return "payé";
  }

  if (amountAllocated > 0) {
    return "partiel";
  }

  return dueDate < today ? "en retard" : "à venir";
}

export function getRemainingRentBalance(amountDue: number, amountAllocated: number) {
  return Math.max(Number(amountDue || 0) - Number(amountAllocated || 0), 0);
}

export function isRentChargeActionRequired({
  amountAllocated,
  amountDue,
  dueDate,
  hasAnomaly = false,
  today,
  warningDays = 7,
}: ComputedRentChargeStatusInput & { hasAnomaly?: boolean; warningDays?: number }) {
  const remainingBalance = getRemainingRentBalance(amountDue, amountAllocated);

  if (hasAnomaly) {
    return true;
  }

  if (remainingBalance <= 0) {
    return false;
  }

  if (amountAllocated > 0) {
    return true;
  }

  return dueDate < today || dueDate <= addDaysIsoDate(today, warningDays);
}

export function getPortfolioPaymentStatusFromCharges(
  charges: Array<RentCharge & { hasAnomaly?: boolean }>,
  allocations: PaymentAllocation[],
  today: string,
  warningDays = 7,
): PaymentStatus {
  const allocationsByChargeId = new Map<string, number>();

  allocations.forEach((allocation) => {
    allocationsByChargeId.set(
      allocation.rentChargeId,
      (allocationsByChargeId.get(allocation.rentChargeId) ?? 0) + Number(allocation.amountAllocated || 0),
    );
  });

  const chargeStates = charges.map((charge) => ({
    amountAllocated: allocationsByChargeId.get(charge.id) ?? 0,
    amountDue: charge.amountDue,
    dueDate: charge.dueDate,
    hasAnomaly: Boolean(charge.hasAnomaly),
  }));

  if (
    chargeStates.some((charge) => {
      const remainingBalance = getRemainingRentBalance(charge.amountDue, charge.amountAllocated);
      return remainingBalance > 0 && charge.dueDate < today;
    })
  ) {
    return "late";
  }

  if (
    chargeStates.some((charge) =>
      isRentChargeActionRequired({
        ...charge,
        today,
        warningDays,
      }),
    )
  ) {
    return "dueSoon";
  }

  return "paid";
}

function addDaysIsoDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day + days);

  return `${nextDate.getFullYear()}-${`${nextDate.getMonth() + 1}`.padStart(2, "0")}-${`${nextDate.getDate()}`.padStart(2, "0")}`;
}

export type FinancialTrackingMode = "current_period" | "lease_start" | "custom" | "historical_only";

export type FinancialTrackingSelection = {
  mode: FinancialTrackingMode;
  customDate: string;
};

export function getCurrentRentPeriodStart(today = getLocalTodayIsoDate()) {
  return `${today.slice(0, 7)}-01`;
}

export function isLeaseEndedByDate(endDate: string, today = getLocalTodayIsoDate()) {
  return Boolean(endDate) && endDate < today;
}

export function needsHistoricalTrackingChoice(startDate: string, endDate: string, today = getLocalTodayIsoDate()) {
  if (!startDate || !endDate) {
    return false;
  }

  return isLeaseEndedByDate(endDate, today) || startDate.slice(0, 7) < today.slice(0, 7);
}

export function getDefaultFinancialTrackingSelection(
  startDate: string,
  endDate: string,
  today = getLocalTodayIsoDate(),
): FinancialTrackingSelection {
  if (isLeaseEndedByDate(endDate, today)) {
    return { mode: "historical_only", customDate: "" };
  }

  if (startDate && startDate.slice(0, 7) < today.slice(0, 7)) {
    return { mode: "current_period", customDate: getCurrentRentPeriodStart(today) };
  }

  return { mode: "lease_start", customDate: startDate };
}

export function getFinancialTrackingSelectionForLease(
  startDate: string,
  endDate: string,
  financialTrackingStartDate: string | null | undefined,
  today = getLocalTodayIsoDate(),
): FinancialTrackingSelection {
  if (financialTrackingStartDate === null) {
    return { mode: "historical_only", customDate: "" };
  }

  const effectiveDate = financialTrackingStartDate ?? startDate;

  if (effectiveDate === startDate) {
    return { mode: "lease_start", customDate: startDate };
  }

  if (effectiveDate === getCurrentRentPeriodStart(today) && !isLeaseEndedByDate(endDate, today)) {
    return { mode: "current_period", customDate: effectiveDate };
  }

  return { mode: "custom", customDate: effectiveDate };
}

export function resolveFinancialTrackingStartDate({
  customDate,
  endDate,
  mode,
  startDate,
  today = getLocalTodayIsoDate(),
}: FinancialTrackingSelection & {
  endDate: string;
  startDate: string;
  today?: string;
}): string | null {
  if (!startDate || !endDate || endDate < startDate) {
    throw new Error("Les dates du bail sont invalides.");
  }

  if (mode === "historical_only") {
    if (!isLeaseEndedByDate(endDate, today)) {
      throw new Error("Le mode historique seulement est réservé aux baux déjà terminés.");
    }

    return null;
  }

  const trackingStartDate = mode === "lease_start"
    ? startDate
    : mode === "current_period"
      ? getCurrentRentPeriodStart(today)
      : customDate;

  if (!trackingStartDate) {
    throw new Error("Choisissez une date de début du suivi financier.");
  }

  if (trackingStartDate < startDate || trackingStartDate > endDate) {
    throw new Error("La date de suivi financier doit être comprise dans les dates du bail.");
  }

  if (mode === "custom" && trackingStartDate > today) {
    throw new Error("La date personnalisée ne peut pas être postérieure à aujourd’hui.");
  }

  return trackingStartDate;
}

function getLocalTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

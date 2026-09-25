export type RentScheduleLease = {
  actualEndDate?: string | null;
  endDate: string;
  financialTrackingStartDate?: string | null;
  startDate: string;
  status: "active" | "ended" | "archived";
};

export type RentSchedulePeriod = {
  dueDate: string;
  periodMonth: string;
};

export function generateRentSchedule(lease: RentScheduleLease, today: string): RentSchedulePeriod[] {
  const trackingStartDate = lease.financialTrackingStartDate === undefined
    ? lease.startDate
    : lease.financialTrackingStartDate;

  if (!lease.startDate || !trackingStartDate || lease.status === "archived") {
    return [];
  }

  const targetGenerationDate = addMonthsIsoDate(maxIsoDate(today, trackingStartDate), 3);
  const generationEndDate = lease.status === "ended"
    ? lease.actualEndDate || lease.endDate
    : minIsoDate(lease.endDate, targetGenerationDate);

  if (!generationEndDate || trackingStartDate > generationEndDate) {
    return [];
  }

  return getMonthsBetween(trackingStartDate.slice(0, 7), generationEndDate.slice(0, 7)).reduce<RentSchedulePeriod[]>(
    (periods, periodMonth) => {
      const dueDate = getDueDateForPeriod(lease.startDate, periodMonth);

      if (lease.status === "ended" && lease.actualEndDate && dueDate > lease.actualEndDate) {
        return periods;
      }

      periods.push({ dueDate, periodMonth });
      return periods;
    },
    [],
  );
}

export function getDueDateForPeriod(leaseStartDate: string, periodMonth: string) {
  if (periodMonth === leaseStartDate.slice(0, 7)) {
    return leaseStartDate;
  }

  const day = Number(leaseStartDate.slice(8, 10));
  const [year, month] = periodMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  return `${periodMonth}-${`${Math.min(day, lastDay)}`.padStart(2, "0")}`;
}

function addMonthsIsoDate(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();

  return `${target.getFullYear()}-${`${target.getMonth() + 1}`.padStart(2, "0")}-${`${Math.min(day, lastDay)}`.padStart(2, "0")}`;
}

function getMonthsBetween(startMonth: string, endMonth: string) {
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
  const months: string[] = [];
  let year = startYear;
  let month = startMonthNumber;

  while (year < endYear || (year === endYear && month <= endMonthNumber)) {
    months.push(`${year}-${`${month}`.padStart(2, "0")}`);
    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function maxIsoDate(left: string, right: string) {
  return left > right ? left : right;
}

function minIsoDate(left: string, right: string) {
  return left < right ? left : right;
}

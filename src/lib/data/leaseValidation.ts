export const leaseDateRangeError = "La date de fin du bail doit être égale ou postérieure à la date de début.";

export function validateLeaseDateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate || endDate < startDate) {
    throw new Error(leaseDateRangeError);
  }
}

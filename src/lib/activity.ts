import type { ActivityType, LocalStore, UnitActivity } from "./types";

type ActivityInput = {
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  type: ActivityType;
  title: string;
  description: string;
  date?: string;
};

export function createActivity(input: ActivityInput): UnitActivity {
  const now = new Date().toISOString();
  const date = input.date ?? now.slice(0, 10);

  return {
    id: createActivityId(input.type),
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantId: input.tenantId,
    type: input.type,
    title: input.title,
    description: input.description,
    date,
    createdAt: now,
  };
}

export function appendActivity(store: LocalStore, input: ActivityInput) {
  const activity = createActivity(input);
  const duplicate = store.activities.some(
    (candidate) =>
      candidate.propertyId === activity.propertyId &&
      candidate.unitId === activity.unitId &&
      candidate.tenantId === activity.tenantId &&
      candidate.type === activity.type &&
      candidate.title === activity.title &&
      candidate.description === activity.description &&
      candidate.date === activity.date,
  );

  if (duplicate) {
    return store;
  }

  return {
    ...store,
    activities: [...store.activities, activity],
  };
}

function createActivityId(type: ActivityType) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `activity-${type}-${crypto.randomUUID()}`;
  }

  return `activity-${type}-${Date.now()}`;
}

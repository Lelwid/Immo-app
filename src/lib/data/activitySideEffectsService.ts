import { createActivityRecord } from "@/lib/data/activitiesService";
import type { ActivityType, LocalStore, UnitActivity } from "@/lib/types";

type ActivitySideEffectInput = {
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  type: ActivityType;
  title: string;
  description: string;
  date?: string;
};

export async function applyActivitySideEffect(store: LocalStore, input: ActivitySideEffectInput): Promise<LocalStore> {
  return runActivitySideEffect(store, async () => {
    const activity = await createActivityRecord(input);

    return {
      ...store,
      activities: upsertActivity(store.activities, activity),
    };
  }, "Impossible de créer l'activité.");
}

async function runActivitySideEffect(store: LocalStore, effect: () => Promise<LocalStore>, errorMessage: string) {
  try {
    return await effect();
  } catch (error) {
    console.error(errorMessage, error);
    return store;
  }
}

function upsertActivity(activities: UnitActivity[], activity: UnitActivity) {
  return activities.some((candidate) => candidate.id === activity.id)
    ? activities.map((candidate) => (candidate.id === activity.id ? activity : candidate))
    : [...activities, activity];
}

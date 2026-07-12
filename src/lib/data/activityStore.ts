import type { LocalStore, UnitActivity } from "@/lib/types";

export function addActivityToStore(store: LocalStore, activity: UnitActivity): LocalStore {
  if (store.activities.some((candidate) => candidate.id === activity.id)) {
    return store;
  }

  return {
    ...store,
    activities: [...store.activities, activity],
  };
}

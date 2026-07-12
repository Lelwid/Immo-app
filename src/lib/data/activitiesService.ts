import { createActivity } from "@/lib/activity";
import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { ActivityType, UnitActivity } from "@/lib/types";

const table = "activities";

type SupabaseActivityRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  unit_id: string | null;
  tenant_id: string | null;
  lease_id: string | null;
  activity_type: string;
  title: string;
  description: string | null;
  activity_date: string;
  created_at: string;
};

export type ActivityInput = {
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  type: ActivityType;
  title: string;
  description: string;
  date?: string;
};

const loadError = "Impossible de charger l'historique.";
const createError = "Impossible de créer l'activité.";
const deleteError = "Impossible de supprimer l'activité.";

export async function getActivities(): Promise<UnitActivity[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!.from(table).select(selectColumns).order("created_at", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortActivities(loadLocalStore().activities);
}

export async function getActivitiesForProperty(propertyId: string): Promise<UnitActivity[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortActivities(loadLocalStore().activities.filter((activity) => activity.propertyId === propertyId));
}

export async function createActivityRecord(input: ActivityInput): Promise<UnitActivity> {
  if (canUseSupabase()) {
    const duplicate = await findSupabaseDuplicate(input);

    if (duplicate) {
      return duplicate;
    }

    const userId = await getCurrentUserId(createError);
    const activity = createActivity(input);
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(activity, userId))
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const activity = createActivity(input);
  const duplicate = store.activities.some((candidate) => isDuplicateActivity(candidate, activity));

  if (duplicate) {
    return store.activities.find((candidate) => isDuplicateActivity(candidate, activity)) ?? activity;
  }

  saveLocalStore({ ...store, activities: [...store.activities, activity] });
  return activity;
}

export async function deleteActivity(activityId: string): Promise<void> {
  if (canUseSupabase()) {
    const { error } = await supabase!.from(table).delete().eq("id", activityId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({ ...store, activities: store.activities.filter((activity) => activity.id !== activityId) });
}

const selectColumns =
  "id,user_id,property_id,unit_id,tenant_id,lease_id,activity_type,title,description,activity_date,created_at";

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

async function findSupabaseDuplicate(input: ActivityInput): Promise<UnitActivity | null> {
  const activity = createActivity(input);
  const { data, error } = await supabase!
    .from(table)
    .select(selectColumns)
    .eq("property_id", activity.propertyId)
    .eq("activity_type", activity.type)
    .eq("title", activity.title)
    .eq("description", activity.description)
    .eq("activity_date", activity.date)
    .limit(1);

  if (error || !data?.[0]) {
    return null;
  }

  return fromSupabaseRow(data[0]);
}

function fromSupabaseRow(row: SupabaseActivityRow): UnitActivity {
  return {
    id: row.id,
    propertyId: row.property_id ?? undefined,
    unitId: row.unit_id ?? undefined,
    tenantId: row.tenant_id,
    leaseId: row.lease_id,
    type: normalizeActivityType(row.activity_type),
    title: row.title,
    description: row.description ?? "",
    date: row.activity_date,
    createdAt: row.created_at,
  };
}

function toSupabaseInsert(activity: UnitActivity, userId: string) {
  return {
    user_id: userId,
    property_id: activity.propertyId || null,
    unit_id: activity.unitId || null,
    tenant_id: activity.tenantId || null,
    lease_id: activity.leaseId || null,
    activity_type: activity.type,
    title: activity.title,
    description: activity.description || null,
    activity_date: activity.date,
  };
}

function isDuplicateActivity(candidate: UnitActivity, activity: UnitActivity) {
  return (
    candidate.propertyId === activity.propertyId &&
    candidate.unitId === activity.unitId &&
    candidate.tenantId === activity.tenantId &&
    candidate.leaseId === activity.leaseId &&
    candidate.type === activity.type &&
    candidate.title === activity.title &&
    candidate.description === activity.description &&
    candidate.date === activity.date
  );
}

function normalizeActivityType(value: string): ActivityType {
  if (
    value === "paiement" ||
    value === "bail" ||
    value === "entretien" ||
    value === "document" ||
    value === "locataire" ||
    value === "immeuble" ||
    value === "note" ||
    value === "tache"
  ) {
    return value;
  }

  return "immeuble";
}

function sortActivities(activities: UnitActivity[]) {
  return [...activities].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));
}

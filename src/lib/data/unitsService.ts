import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Property, Unit } from "@/lib/types";

const table = "units";

type SupabaseUnitRow = {
  id: string;
  property_id: string;
  name: string;
  floor: string | null;
  floor_index: number | null;
  sort_order: number | null;
  monthly_rent: number | null;
  status: string | null;
  tenant_id: string | null;
  alerts_count: number | null;
  created_at?: string;
  updated_at?: string;
};

export type UnitInput = Omit<Unit, "id">;

const loadError = "Impossible de charger les logements.";
const createError = "Impossible de créer le logement.";
const updateError = "Impossible de modifier le logement.";
const deleteError = "Impossible de supprimer le logement.";

export async function getUnits(propertyId?: string): Promise<Unit[]> {
  if (canUseSupabase()) {
    let query = supabase!
      .from(table)
      .select("id,property_id,name,floor,floor_index,sort_order,monthly_rent,status,tenant_id,alerts_count,created_at,updated_at")
      .order("sort_order", { ascending: true })
      .order("floor_index", { ascending: true })
      .order("name", { ascending: true });

    if (propertyId) {
      query = query.eq("property_id", propertyId);
    }

    const { data, error } = await query;

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow).sort(compareUnitsNumerically);
  }

  const units = loadLocalStore().units;
  return (propertyId ? units.filter((unit) => unit.propertyId === propertyId) : units).sort(compareUnitsNumerically);
}

export async function createUnit(input: UnitInput): Promise<Unit> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(input))
      .select("id,property_id,name,floor,floor_index,sort_order,monthly_rent,status,tenant_id,alerts_count,created_at,updated_at")
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const unit: Unit = {
    id: createLocalUnitId(input.propertyId, input.floorIndex),
    ...input,
  };
  const store = loadLocalStore();

  saveLocalStore({
    ...store,
    units: [...store.units, unit].sort(compareUnitsNumerically),
  });

  return unit;
}

export async function createUnitsForProperty(
  propertyId: string,
  propertyType: Property["propertyType"],
  unitCount: number,
): Promise<Unit[]> {
  const inputs = buildDefaultUnitInputs(propertyId, propertyType, unitCount);

  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .insert(inputs.map(toSupabaseInsert))
      .select("id,property_id,name,floor,floor_index,sort_order,monthly_rent,status,tenant_id,alerts_count,created_at,updated_at");

    if (error || !data) {
      throw new Error(createError);
    }

    return data.map(fromSupabaseRow).sort(compareUnitsNumerically);
  }

  const units = inputs.map((input) => ({
    id: createLocalUnitId(input.propertyId, input.floorIndex),
    ...input,
  }));
  const store = loadLocalStore();

  saveLocalStore({
    ...store,
    units: [...store.units, ...units].sort(compareUnitsNumerically),
  });

  return units;
}

export async function updateUnit(unitId: string, input: UnitInput): Promise<Unit> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabaseUpdate(input))
      .eq("id", unitId)
      .select("id,property_id,name,floor,floor_index,sort_order,monthly_rent,status,tenant_id,alerts_count,created_at,updated_at")
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const unit: Unit = {
    id: unitId,
    ...input,
  };
  const store = loadLocalStore();

  saveLocalStore({
    ...store,
    units: store.units.map((candidate) => (candidate.id === unitId ? unit : candidate)).sort(compareUnitsNumerically),
  });

  return unit;
}

export async function deleteUnit(unitId: string): Promise<void> {
  if (canUseSupabase()) {
    const { error } = await supabase!.from(table).delete().eq("id", unitId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({ ...store, units: store.units.filter((unit) => unit.id !== unitId) });
}

export async function listUnits(propertyId?: string): Promise<Unit[]> {
  return getUnits(propertyId);
}

export async function upsertUnit(unit: Unit) {
  const store = loadLocalStore();
  const exists = store.units.some((candidate) => candidate.id === unit.id);

  return exists ? updateUnit(unit.id, toUnitInput(unit)) : createUnit(toUnitInput(unit));
}

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

function buildDefaultUnitInputs(propertyId: string, propertyType: Property["propertyType"], requestedUnitCount: number): UnitInput[] {
  const fixedFloorLabels: Partial<Record<Property["propertyType"], string[]>> = {
    condo: ["Unité principale"],
    duplex: ["Rez-de-chaussée", "2e étage"],
    triplex: ["Rez-de-chaussée", "2e étage", "3e étage"],
    quadruplex: ["Rez-de-chaussée", "2e étage", "3e étage", "4e étage"],
  };
  const unitCount = propertyType === "immeuble" ? Math.max(5, requestedUnitCount) : getFixedUnitCount(propertyType);
  const floorLabels =
    propertyType === "immeuble"
      ? Array.from({ length: unitCount }, (_, index) => `Logement ${index + 1}`)
      : fixedFloorLabels[propertyType] ?? [];

  return floorLabels.map((floor, index) => ({
    propertyId,
    label: `Logement ${index + 1}`,
    floor,
    floorIndex: index + 1,
    monthlyRent: 0,
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    tenantId: null,
    paymentStatus: "paid",
    notes: "",
  }));
}

function getFixedUnitCount(propertyType: Property["propertyType"]) {
  const counts: Record<Property["propertyType"], number> = {
    condo: 1,
    duplex: 2,
    triplex: 3,
    quadruplex: 4,
    immeuble: 5,
  };

  return counts[propertyType];
}

function fromSupabaseRow(row: SupabaseUnitRow): Unit {
  const floorIndex = row.floor_index ?? row.sort_order ?? getUnitSortNumber(row.name);

  return {
    id: row.id,
    propertyId: row.property_id,
    label: row.name,
    floor: row.floor ?? row.name,
    floorIndex,
    monthlyRent: Number(row.monthly_rent ?? 0),
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    tenantId: row.tenant_id,
    paymentStatus: "paid",
    notes: "",
  };
}

function toSupabaseInsert(input: UnitInput) {
  return {
    property_id: input.propertyId,
    name: input.label,
    floor: input.floor,
    floor_index: input.floorIndex,
    sort_order: getUnitSortNumber(input.label) || input.floorIndex,
    monthly_rent: 0,
    status: "vacant",
    tenant_id: null,
    alerts_count: 0,
  };
}

function toSupabaseUpdate(input: UnitInput) {
  return toSupabaseInsert(input);
}

function toUnitInput(unit: Unit): UnitInput {
  return {
    propertyId: unit.propertyId,
    label: unit.label,
    floor: unit.floor,
    floorIndex: unit.floorIndex,
    monthlyRent: 0,
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    tenantId: null,
    paymentStatus: "paid",
    notes: "",
  };
}

function compareUnitsNumerically(a: Unit, b: Unit) {
  const numberDelta = getUnitSortNumber(a.label) - getUnitSortNumber(b.label);

  if (numberDelta !== 0) {
    return numberDelta;
  }

  return a.floorIndex - b.floorIndex;
}

function getUnitSortNumber(label: string) {
  return Number(label.match(/\d+/)?.[0] ?? 0);
}

function createLocalUnitId(propertyId: string, floorIndex: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `unit-${crypto.randomUUID()}`;
  }

  return `${propertyId}-unit-${floorIndex}-${Date.now()}`;
}

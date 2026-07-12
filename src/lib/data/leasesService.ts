import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Lease, RentPaymentStatus } from "@/lib/types";

const table = "leases";

type SupabaseLeaseRow = {
  id: string;
  property_id: string;
  unit_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number | string;
  payment_status: string | null;
  status: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LeaseInput = {
  propertyId: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  paymentStatus?: RentPaymentStatus;
  status?: Lease["status"];
  notes?: string;
};

const loadError = "Impossible de charger les baux.";
const createError = "Impossible de créer le bail.";
const updateError = "Impossible de modifier le bail.";
const deleteError = "Impossible de supprimer le bail.";
const activeLeaseError = "Ce logement possède déjà un bail actif.";

export async function getLeases(): Promise<Lease[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select("id,property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,payment_status,status,notes,created_at,updated_at")
      .order("start_date", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return loadLocalStore().leases;
}

export async function getLeasesByProperty(propertyId: string): Promise<Lease[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select("id,property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,payment_status,status,notes,created_at,updated_at")
      .eq("property_id", propertyId)
      .order("start_date", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return loadLocalStore().leases.filter((lease) => lease.propertyId === propertyId);
}

export async function getActiveLeaseByUnit(unitId: string): Promise<Lease | null> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select("id,property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,payment_status,status,notes,created_at,updated_at")
      .eq("unit_id", unitId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw new Error(loadError);
    }

    return data ? fromSupabaseRow(data) : null;
  }

  return loadLocalStore().leases.find((lease) => lease.unitId === unitId && lease.status === "active") ?? null;
}

export async function createLease(input: LeaseInput): Promise<Lease> {
  const leaseInput = normalizeLeaseInput(input);

  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(leaseInput))
      .select("id,property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,payment_status,status,notes,created_at,updated_at")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new Error(activeLeaseError);
      }

      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();

  if (leaseInput.status === "active" && store.leases.some((lease) => lease.unitId === leaseInput.unitId && lease.status === "active")) {
    throw new Error(activeLeaseError);
  }

  const now = new Date().toISOString();
  const lease: Lease = {
    id: createLocalLeaseId(),
    ...leaseInput,
    createdAt: now,
    updatedAt: now,
  };

  saveLocalStore({
    ...store,
    leases: [...store.leases, lease],
  });

  return lease;
}

export async function updateLease(leaseId: string, input: LeaseInput): Promise<Lease> {
  const leaseInput = normalizeLeaseInput(input);

  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabaseInsert(leaseInput))
      .eq("id", leaseId)
      .select("id,property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,payment_status,status,notes,created_at,updated_at")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new Error(activeLeaseError);
      }

      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existingLease = store.leases.find((lease) => lease.id === leaseId);

  if (!existingLease) {
    throw new Error(updateError);
  }

  if (
    leaseInput.status === "active" &&
    store.leases.some((lease) => lease.id !== leaseId && lease.unitId === leaseInput.unitId && lease.status === "active")
  ) {
    throw new Error(activeLeaseError);
  }

  const lease: Lease = {
    id: leaseId,
    ...leaseInput,
    createdAt: existingLease.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const leases = store.leases.map((candidate) => (candidate.id === leaseId ? lease : candidate));

  saveLocalStore({ ...store, leases });
  return lease;
}

export async function endLease(leaseId: string): Promise<Lease> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .update({ status: "ended" })
      .eq("id", leaseId)
      .select("id,property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,payment_status,status,notes,created_at,updated_at")
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existingLease = store.leases.find((lease) => lease.id === leaseId);

  if (!existingLease) {
    throw new Error(updateError);
  }

  const endedLease: Lease = {
    ...existingLease,
    status: "ended",
    updatedAt: new Date().toISOString(),
  };
  saveLocalStore({
    ...store,
    leases: store.leases.map((lease) => (lease.id === leaseId ? endedLease : lease)),
  });

  return endedLease;
}

export async function deleteLease(leaseId: string): Promise<void> {
  if (canUseSupabase()) {
    const { data, error: loadLeaseError } = await supabase!.from(table).select("status").eq("id", leaseId).maybeSingle();

    if (loadLeaseError || data?.status === "active") {
      throw new Error(deleteError);
    }

    const { error } = await supabase!.from(table).delete().eq("id", leaseId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  const lease = store.leases.find((candidate) => candidate.id === leaseId);

  if (!lease || lease.status === "active") {
    throw new Error(deleteError);
  }

  saveLocalStore({ ...store, leases: store.leases.filter((candidate) => candidate.id !== leaseId) });
}

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

function fromSupabaseRow(row: SupabaseLeaseRow): Lease {
  return {
    id: row.id,
    propertyId: row.property_id,
    unitId: row.unit_id,
    tenantId: row.tenant_id,
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyRent: Number(row.monthly_rent ?? 0),
    paymentStatus: normalizeRentPaymentStatus(row.payment_status),
    status: normalizeLeaseStatus(row.status),
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSupabaseInsert(input: LeaseInput) {
  return {
    property_id: input.propertyId,
    unit_id: input.unitId,
    tenant_id: input.tenantId,
    start_date: input.startDate,
    end_date: input.endDate,
    monthly_rent: input.monthlyRent,
    payment_status: input.paymentStatus ?? "à venir",
    status: input.status ?? "active",
    notes: input.notes?.trim() || null,
  };
}

function normalizeLeaseInput(input: LeaseInput): Required<LeaseInput> {
  return {
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantId: input.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    monthlyRent: Number(input.monthlyRent || 0),
    paymentStatus: input.paymentStatus ?? "à venir",
    status: input.status ?? "active",
    notes: input.notes ?? "",
  };
}

function normalizeRentPaymentStatus(status: string | null): RentPaymentStatus {
  if (status === "payé" || status === "partiel" || status === "en retard" || status === "à venir") {
    return status;
  }

  return "à venir";
}

function normalizeLeaseStatus(status: string | null): Lease["status"] {
  if (status === "active" || status === "ended" || status === "archived") {
    return status;
  }

  return "active";
}

function createLocalLeaseId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `lease-${crypto.randomUUID()}`;
  }

  return `lease-${Date.now()}`;
}

import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Tenant } from "@/lib/types";

const table = "tenants";

type SupabaseTenantRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TenantInput = {
  fullName: string;
  email?: string;
  phone?: string;
  notes?: string;
};

const loadError = "Impossible de charger les locataires.";
const createError = "Impossible de créer le locataire.";
const updateError = "Impossible de modifier le locataire.";
const deleteError = "Impossible de supprimer le locataire.";

export async function getTenants(): Promise<Tenant[]> {
  if (canUseSupabase()) {
    const userId = await getCurrentUserId(loadError);
    const { data, error } = await supabase!
      .from(table)
      .select("id,user_id,full_name,email,phone,notes,archived_at,created_at,updated_at")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("full_name", { ascending: true });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return loadLocalStore().tenants.filter((tenant) => !tenant.archivedAt);
}

export async function createTenant(input: TenantInput): Promise<Tenant> {
  if (canUseSupabase()) {
    const userId = await getCurrentUserId(createError);
    const { data, error } = await supabase!
      .from(table)
      .insert({
        user_id: userId,
        full_name: input.fullName.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .select("id,user_id,full_name,email,phone,notes,archived_at,created_at,updated_at")
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const now = new Date().toISOString();
  const tenant = normalizeTenant({
    id: createLocalTenantId(),
    ...splitFullName(input.fullName),
    fullName: input.fullName.trim(),
    email: input.email?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const store = loadLocalStore();

  saveLocalStore({ ...store, tenants: [...store.tenants, tenant] });
  return tenant;
}

export async function updateTenant(tenantId: string, input: TenantInput): Promise<Tenant> {
  if (canUseSupabase()) {
    const userId = await getCurrentUserId(updateError);
    const { data, error } = await supabase!
      .from(table)
      .update({
        full_name: input.fullName.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .eq("id", tenantId)
      .eq("user_id", userId)
      .select("id,user_id,full_name,email,phone,notes,archived_at,created_at,updated_at")
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existingTenant = store.tenants.find((tenant) => tenant.id === tenantId);

  if (!existingTenant) {
    throw new Error(updateError);
  }

  const tenant = normalizeTenant({
    ...existingTenant,
    ...splitFullName(input.fullName),
    fullName: input.fullName.trim(),
    email: input.email?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    updatedAt: new Date().toISOString(),
  });

  saveLocalStore({
    ...store,
    tenants: store.tenants.map((candidate) => (candidate.id === tenantId ? tenant : candidate)),
  });

  return tenant;
}

export async function archiveTenant(tenantId: string): Promise<Tenant> {
  const archivedAt = new Date().toISOString();

  if (canUseSupabase()) {
    const userId = await getCurrentUserId(updateError);
    const { data, error } = await supabase!
      .from(table)
      .update({ archived_at: archivedAt })
      .eq("id", tenantId)
      .eq("user_id", userId)
      .select("id,user_id,full_name,email,phone,notes,archived_at,created_at,updated_at")
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existingTenant = store.tenants.find((tenant) => tenant.id === tenantId);

  if (!existingTenant) {
    throw new Error(updateError);
  }

  const archivedTenant = normalizeTenant({ ...existingTenant, archivedAt, updatedAt: archivedAt });

  saveLocalStore({
    ...store,
    tenants: store.tenants.map((tenant) => (tenant.id === tenantId ? archivedTenant : tenant)),
  });

  return archivedTenant;
}

export async function deleteTenant(tenantId: string): Promise<void> {
  if (canUseSupabase()) {
    const leaseHistory = await supabase!
      .from("leases")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1);

    if (leaseHistory.error) {
      throw new Error(deleteError);
    }

    if (leaseHistory.data && leaseHistory.data.length > 0) {
      const { error: endLeasesError } = await supabase!
        .from("leases")
        .update({ status: "ended" })
        .eq("tenant_id", tenantId)
        .eq("status", "active");

      if (endLeasesError) {
        throw new Error(deleteError);
      }

      await archiveTenant(tenantId);
      return;
    }

    const userId = await getCurrentUserId(deleteError);
    const { error } = await supabase!.from(table).delete().eq("id", tenantId).eq("user_id", userId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  const hasLeaseHistory = store.leases.some((lease) => lease.tenantId === tenantId);
  const hasLegacyOccupation = store.units.some((unit) => unit.tenantId === tenantId);

  if (hasLeaseHistory || hasLegacyOccupation) {
    const now = new Date().toISOString();
    const existingTenant = store.tenants.find((tenant) => tenant.id === tenantId);

    if (!existingTenant) {
      throw new Error(deleteError);
    }

    saveLocalStore({
      ...store,
      tenants: store.tenants.map((tenant) =>
        tenant.id === tenantId ? { ...tenant, archivedAt: now, updatedAt: now } : tenant,
      ),
      leases: store.leases.map((lease) =>
        lease.tenantId === tenantId && lease.status === "active" ? { ...lease, status: "ended", updatedAt: now } : lease,
      ),
    });
    return;
  }

  saveLocalStore({ ...store, tenants: store.tenants.filter((tenant) => tenant.id !== tenantId) });
}

export async function listTenants(): Promise<Tenant[]> {
  return getTenants();
}

export async function upsertTenant(tenant: Tenant) {
  const fullName = getTenantFullName(tenant);
  const input: TenantInput = {
    fullName,
    email: tenant.email,
    phone: tenant.phone,
    notes: tenant.notes,
  };

  if (canUseSupabase() && isUuid(tenant.id)) {
    return updateTenant(tenant.id, input);
  }

  const store = loadLocalStore();
  const exists = store.tenants.some((candidate) => candidate.id === tenant.id);

  if (!exists) {
    const now = new Date().toISOString();
    const localTenant = normalizeTenant({
      ...tenant,
      fullName,
      archivedAt: tenant.archivedAt ?? null,
      createdAt: tenant.createdAt || now,
      updatedAt: tenant.updatedAt || now,
    });

    saveLocalStore({ ...store, tenants: [...store.tenants, localTenant] });
    return localTenant;
  }

  return updateTenant(tenant.id, input);
}

export async function deleteTenantRecord(tenantId: string) {
  return deleteTenant(tenantId);
}

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

function fromSupabaseRow(row: SupabaseTenantRow): Tenant {
  const name = splitFullName(row.full_name);

  return normalizeTenant({
    id: row.id,
    fullName: row.full_name,
    firstName: name.firstName,
    lastName: name.lastName,
    email: row.email ?? "",
    phone: row.phone ?? "",
    notes: row.notes ?? "",
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function normalizeTenant(tenant: Tenant): Tenant {
  const fullName = getTenantFullName(tenant);

  return {
    ...tenant,
    fullName,
    firstName: tenant.firstName || splitFullName(fullName).firstName,
    lastName: tenant.lastName || splitFullName(fullName).lastName,
    email: tenant.email ?? "",
    phone: tenant.phone ?? "",
    notes: tenant.notes ?? "",
    archivedAt: tenant.archivedAt ?? null,
  };
}

function getTenantFullName(tenant: Tenant) {
  return tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim();
}

function splitFullName(fullName: string) {
  const [firstName, ...lastNameParts] = fullName.trim().split(/\s+/);

  return {
    firstName: firstName || "",
    lastName: lastNameParts.join(" "),
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createLocalTenantId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tenant-${crypto.randomUUID()}`;
  }

  return `tenant-${Date.now()}`;
}

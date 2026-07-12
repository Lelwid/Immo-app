import { applyActivitySideEffect } from "@/lib/data/activitySideEffectsService";
import { getDataMode } from "@/lib/data/dataMode";
import { getActiveLeaseForUnit, getUnitOccupancy } from "@/lib/data/leaseAdapters";
import {
  archiveTenantAndEndActiveLeases as archiveTenantAndEndActiveLeasesLocal,
  assignTenantToUnit as assignTenantToUnitLocal,
  endActiveLeaseForUnit as endActiveLeaseForUnitLocal,
  saveLeaseForUnit as saveLeaseForUnitLocal,
  updateTenantProfile as updateTenantProfileLocal,
  toRentPaymentStatus,
  type AssignTenantToUnitInput,
  type SaveLeaseInput,
  type TenantProfileInput,
} from "@/lib/data/leaseWorkflows";
import { createLease, endLease, getActiveLeaseByUnit, getLeases, updateLease } from "@/lib/data/leasesService";
import { archiveTenant, createTenant, updateTenant } from "@/lib/data/tenantsService";
import { applyTenantNoteSideEffect } from "@/lib/data/notesSideEffectsService";
import { applyInitialPaymentSideEffect } from "@/lib/data/paymentSideEffectsService";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import type { Lease, LocalStore, Tenant } from "@/lib/types";

export type { AssignTenantToUnitInput, SaveLeaseInput, TenantProfileInput };

export const activeLeaseError = "Ce logement possède déjà un bail actif.";

export async function assignTenantToUnit(store: LocalStore, input: AssignTenantToUnitInput): Promise<LocalStore> {
  if (!shouldUseSupabasePrimaryWrites()) {
    return assignTenantToUnitLocal(store, input);
  }

  const targetUnit = store.units.find((unit) => unit.id === input.unitId && unit.propertyId === input.propertyId);

  if (!targetUnit) {
    return store;
  }

  const existingActiveLease = await getActiveLeaseByUnit(targetUnit.id);

  if (existingActiveLease || getUnitOccupancy(targetUnit, store.leases, store.tenants).isOccupied) {
    throw new Error(activeLeaseError);
  }

  const tenant = await createTenant({
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    notes: input.notes,
  });
  const lease = await createLease({
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    tenantId: tenant.id,
    startDate: input.leaseStartDate,
    endDate: input.leaseEndDate,
    monthlyRent: input.monthlyRent,
    paymentStatus: toRentPaymentStatus(input.paymentStatus),
    status: "active",
    notes: input.notes,
  });

  let nextStore = upsertTenantAndLease(store, tenant, lease);
  nextStore = await applyInitialPaymentSideEffect(nextStore, {
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    leaseId: lease.id,
    tenantId: tenant.id,
    rent: input.monthlyRent,
    leaseStartDate: input.leaseStartDate,
    paymentStatus: input.paymentStatus,
  });
  nextStore = await applyTenantNoteSideEffect(nextStore, {
    content: input.notes,
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    tenantId: tenant.id,
  });

  return applyActivitySideEffect(nextStore, {
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    tenantId: tenant.id,
    type: "locataire",
    title: `Locataire ajouté au ${targetUnit.label}`,
    description: `${getTenantDisplayName(tenant)} a été assigné au ${targetUnit.label}.`,
  });
}

export const createTenantWithLease = assignTenantToUnit;

export async function updateTenantProfile(store: LocalStore, tenantId: string, input: TenantProfileInput): Promise<LocalStore> {
  if (!shouldUseSupabasePrimaryWrites()) {
    return updateTenantProfileLocal(store, tenantId, input);
  }

  const updatedTenant = await updateTenant(tenantId, {
    fullName: `${input.firstName} ${input.lastName}`.trim(),
    email: input.email,
    phone: input.phone,
    notes: store.tenants.find((tenant) => tenant.id === tenantId)?.notes,
  });
  const unit = getCurrentUnitForTenant(tenantId, store);
  const nextStore: LocalStore = {
    ...store,
    tenants: upsertTenant(store.tenants, updatedTenant),
  };

  return applyActivitySideEffect(nextStore, {
    propertyId: unit?.propertyId ?? store.properties[0]?.id ?? "",
    unitId: unit?.id,
    tenantId,
    type: "locataire",
    title: "Locataire modifié",
    description: `${getTenantDisplayName(updatedTenant)} a été modifié.`,
  });
}

export async function saveLeaseForUnit(store: LocalStore, input: SaveLeaseInput): Promise<LocalStore> {
  if (!shouldUseSupabasePrimaryWrites()) {
    return saveLeaseForUnitLocal(store, input);
  }

  const unit = store.units.find((candidate) => candidate.id === input.unitId);

  if (!unit) {
    return store;
  }

  const activeLease = (await getActiveLeaseByUnit(unit.id)) ?? getActiveLeaseForUnit(unit.id, store.leases);

  if (!input.tenantId) {
    return activeLease ? endActiveLeaseForUnit(store, unit.id) : store;
  }

  const tenant = store.tenants.find((candidate) => candidate.id === input.tenantId && !candidate.archivedAt);

  if (!tenant) {
    return store;
  }

  const leaseInput = {
    propertyId: unit.propertyId,
    unitId: unit.id,
    tenantId: input.tenantId,
    startDate: input.leaseStartDate,
    endDate: input.leaseEndDate,
    monthlyRent: input.monthlyRent,
    paymentStatus: toRentPaymentStatus(input.paymentStatus),
    status: "active" as const,
    notes: input.notes,
  };
  const savedLease = activeLease ? await updateLease(activeLease.id, leaseInput) : await createLease(leaseInput);
  const nextStore: LocalStore = {
    ...store,
    leases: upsertLease(store.leases, savedLease),
  };

  return applyActivitySideEffect(nextStore, {
    propertyId: unit.propertyId,
    unitId: unit.id,
    tenantId: input.tenantId,
    type: "bail",
    title: activeLease ? "Bail modifié" : "Bail créé",
    description: `Bail de ${unit.label} ${activeLease ? "modifié" : "créé"}.`,
  });
}

export async function endActiveLeaseForUnit(store: LocalStore, unitId: string): Promise<LocalStore> {
  if (!shouldUseSupabasePrimaryWrites()) {
    return endActiveLeaseForUnitLocal(store, unitId);
  }

  const activeLease = (await getActiveLeaseByUnit(unitId)) ?? getActiveLeaseForUnit(unitId, store.leases);
  const unit = store.units.find((candidate) => candidate.id === unitId);

  if (!activeLease || !unit) {
    return store;
  }

  const endedLease = await endLease(activeLease.id);
  const tenant = store.tenants.find((candidate) => candidate.id === activeLease.tenantId) ?? null;
  const nextStore: LocalStore = {
    ...store,
    leases: upsertLease(store.leases, endedLease),
  };

  return applyActivitySideEffect(nextStore, {
    propertyId: activeLease.propertyId,
    unitId: activeLease.unitId,
    tenantId: activeLease.tenantId,
    type: "bail",
    title: `Bail terminé - ${unit.label}`,
    description: `${tenant ? getTenantDisplayName(tenant) : "Le locataire"} a été retiré du ${unit.label}. Le logement est maintenant vacant.`,
  });
}

export async function archiveTenantAndEndActiveLeases(store: LocalStore, tenantId: string): Promise<LocalStore> {
  if (!shouldUseSupabasePrimaryWrites()) {
    return archiveTenantAndEndActiveLeasesLocal(store, tenantId);
  }

  const tenant = store.tenants.find((candidate) => candidate.id === tenantId);

  if (!tenant) {
    return store;
  }

  const allLeases = await getLeases();
  const activeLeases = allLeases.filter((lease) => lease.tenantId === tenantId && lease.status === "active");
  const endedLeases = await Promise.all(activeLeases.map((lease) => endLease(lease.id)));
  const archivedTenant = await archiveTenant(tenantId);
  const firstLease = activeLeases[0];
  const firstUnit = firstLease ? store.units.find((unit) => unit.id === firstLease.unitId) : null;
  let nextStore: LocalStore = {
    ...store,
    tenants: upsertTenant(store.tenants, archivedTenant),
    leases: mergeLeases(store.leases, endedLeases),
  };

  nextStore = await applyActivitySideEffect(nextStore, {
    propertyId: firstLease?.propertyId ?? firstUnit?.propertyId ?? store.properties[0]?.id ?? "",
    unitId: firstLease?.unitId,
    tenantId,
    type: "locataire",
    title: "Locataire archivé",
    description: `${getTenantDisplayName(tenant)} a été archivé. Ses baux actifs ont été terminés et son historique est conservé.`,
  });

  return nextStore;
}

function shouldUseSupabasePrimaryWrites() {
  return getDataMode() === "supabase" && isSupabaseConfigured;
}

function upsertTenantAndLease(store: LocalStore, tenant: Tenant, lease: Lease): LocalStore {
  return {
    ...store,
    tenants: upsertTenant(store.tenants, tenant),
    leases: upsertLease(store.leases, lease),
  };
}

export function getCurrentUnitForTenant(tenantId: string, store: LocalStore) {
  const activeLease = store.leases.find((lease) => lease.tenantId === tenantId && lease.status === "active");

  if (activeLease) {
    return store.units.find((unit) => unit.id === activeLease.unitId) ?? null;
  }

  return store.units.find((unit) => unit.tenantId === tenantId) ?? null;
}

export function isUnitAvailableForLease(store: LocalStore, unitId: string) {
  const unit = store.units.find((candidate) => candidate.id === unitId);

  return unit ? !getUnitOccupancy(unit, store.leases, store.tenants).isOccupied : false;
}

function upsertTenant(tenants: Tenant[], tenant: Tenant) {
  return tenants.some((candidate) => candidate.id === tenant.id)
    ? tenants.map((candidate) => (candidate.id === tenant.id ? tenant : candidate))
    : [...tenants, tenant];
}

function upsertLease(leases: Lease[], lease: Lease) {
  return leases.some((candidate) => candidate.id === lease.id)
    ? leases.map((candidate) => (candidate.id === lease.id ? lease : candidate))
    : [...leases, lease];
}

function mergeLeases(current: Lease[], next: Lease[]) {
  return next.reduce((leases, lease) => upsertLease(leases, lease), current);
}

function getTenantDisplayName(tenant: Tenant) {
  return tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim();
}

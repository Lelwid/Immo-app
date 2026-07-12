import { applyActivitySideEffect } from "@/lib/data/activitySideEffectsService";
import { getActiveLeaseForUnit, getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { applyTenantNoteSideEffect } from "@/lib/data/notesSideEffectsService";
import { applyInitialPaymentSideEffect } from "@/lib/data/paymentSideEffectsService";
import type { Lease, LocalStore, PaymentStatus, RentPaymentStatus, Tenant } from "@/lib/types";

export type AssignTenantToUnitInput = {
  propertyId: string;
  unitId: string;
  fullName: string;
  email?: string;
  phone?: string;
  monthlyRent: number;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus: PaymentStatus;
  notes?: string;
};

export type SaveLeaseInput = {
  unitId: string;
  tenantId: string | null;
  monthlyRent: number;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus: PaymentStatus;
  notes?: string;
};

export type TenantProfileInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export const activeLeaseError = "Ce logement possède déjà un bail actif.";

export async function assignTenantToUnit(store: LocalStore, input: AssignTenantToUnitInput): Promise<LocalStore> {
  const targetUnit = store.units.find((unit) => unit.id === input.unitId && unit.propertyId === input.propertyId);

  if (!targetUnit) {
    return store;
  }

  if (getUnitOccupancy(targetUnit, store.leases, store.tenants).isOccupied) {
    throw new Error(activeLeaseError);
  }

  const tenantId = createLocalId("tenant");
  const tenantName = splitFullName(input.fullName);
  const now = new Date().toISOString();
  const tenant: Tenant = {
    id: tenantId,
    fullName: input.fullName.trim(),
    firstName: tenantName.firstName,
    lastName: tenantName.lastName,
    email: input.email?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    notes: input.notes?.trim() ?? "",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const lease = createLeaseRecord({
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    tenantId,
    monthlyRent: input.monthlyRent,
    leaseStartDate: input.leaseStartDate,
    leaseEndDate: input.leaseEndDate,
    paymentStatus: input.paymentStatus,
    notes: input.notes,
  });
  let nextStore: LocalStore = {
    ...store,
    tenants: [...store.tenants, tenant],
    leases: [...store.leases, lease],
  };

  nextStore = await applyInitialPaymentSideEffect(nextStore, {
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    leaseId: lease.id,
    tenantId,
    rent: input.monthlyRent,
    leaseStartDate: input.leaseStartDate,
    paymentStatus: input.paymentStatus,
  });
  nextStore = await applyTenantNoteSideEffect(nextStore, {
    content: input.notes,
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    tenantId,
  });

  return applyActivitySideEffect(nextStore, {
    propertyId: targetUnit.propertyId,
    unitId: targetUnit.id,
    tenantId,
    type: "locataire",
    title: `Locataire ajouté au ${targetUnit.label}`,
    description: `${getTenantDisplayName(tenant)} a été assigné au ${targetUnit.label}.`,
  });
}

export async function saveLeaseForUnit(store: LocalStore, input: SaveLeaseInput): Promise<LocalStore> {
  const unit = store.units.find((candidate) => candidate.id === input.unitId);

  if (!unit) {
    return store;
  }

  const activeLease = getActiveLeaseForUnit(unit.id, store.leases);

  if (!input.tenantId) {
    return activeLease ? endActiveLeaseForUnit(store, unit.id) : store;
  }

  const existingTenant = store.tenants.find((tenant) => tenant.id === input.tenantId && !tenant.archivedAt);

  if (!existingTenant) {
    return store;
  }

  const nextLease = createLeaseRecord({
    propertyId: unit.propertyId,
    unitId: unit.id,
    tenantId: input.tenantId,
    monthlyRent: input.monthlyRent,
    leaseStartDate: input.leaseStartDate,
    leaseEndDate: input.leaseEndDate,
    paymentStatus: input.paymentStatus,
    notes: input.notes,
    existingLeaseId: activeLease?.id,
    existingCreatedAt: activeLease?.createdAt,
  });

  if (!activeLease && store.leases.some((lease) => lease.unitId === unit.id && lease.status === "active")) {
    throw new Error(activeLeaseError);
  }

  const leases = activeLease
    ? store.leases.map((lease) => (lease.id === activeLease.id ? nextLease : lease))
    : [...store.leases, nextLease];
  const nextStore = {
    ...store,
    leases,
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

export async function updateTenantProfile(store: LocalStore, tenantId: string, input: TenantProfileInput): Promise<LocalStore> {
  const existingTenant = store.tenants.find((tenant) => tenant.id === tenantId);

  if (!existingTenant) {
    return store;
  }

  const updatedTenant: Tenant = {
    ...existingTenant,
    ...input,
    fullName: `${input.firstName} ${input.lastName}`.trim(),
    updatedAt: new Date().toISOString(),
  };
  const unit = getCurrentUnitForTenant(tenantId, store);
  const nextStore = {
    ...store,
    tenants: store.tenants.map((tenant) => (tenant.id === tenantId ? updatedTenant : tenant)),
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

export async function endActiveLeaseForUnit(store: LocalStore, unitId: string): Promise<LocalStore> {
  const activeLease = getActiveLeaseForUnit(unitId, store.leases);
  const unit = store.units.find((candidate) => candidate.id === unitId);

  if (!activeLease || !unit) {
    return store;
  }

  const endedLease: Lease = {
    ...activeLease,
    status: "ended",
    updatedAt: new Date().toISOString(),
  };
  const tenant = store.tenants.find((candidate) => candidate.id === activeLease.tenantId) ?? null;
  const nextStore = {
    ...store,
    leases: store.leases.map((lease) => (lease.id === activeLease.id ? endedLease : lease)),
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
  const tenant = store.tenants.find((candidate) => candidate.id === tenantId);

  if (!tenant) {
    return store;
  }

  const now = new Date().toISOString();
  const activeLeases = store.leases.filter((lease) => lease.tenantId === tenantId && lease.status === "active");
  const archivedTenant: Tenant = {
    ...tenant,
    archivedAt: now,
    updatedAt: now,
  };
  let nextStore: LocalStore = {
    ...store,
    tenants: store.tenants.map((candidate) => (candidate.id === tenantId ? archivedTenant : candidate)),
    leases: store.leases.map((lease) => (lease.tenantId === tenantId && lease.status === "active" ? { ...lease, status: "ended", updatedAt: now } : lease)),
  };
  const firstLease = activeLeases[0];
  const firstUnit = firstLease ? store.units.find((unit) => unit.id === firstLease.unitId) : null;

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

export function toRentPaymentStatus(status: PaymentStatus): RentPaymentStatus {
  if (status === "paid") {
    return "payé";
  }

  if (status === "late") {
    return "en retard";
  }

  return "à venir";
}

function createLeaseRecord({
  existingCreatedAt,
  existingLeaseId,
  leaseEndDate,
  leaseStartDate,
  monthlyRent,
  notes,
  paymentStatus,
  propertyId,
  tenantId,
  unitId,
}: {
  existingCreatedAt?: string;
  existingLeaseId?: string;
  leaseEndDate: string;
  leaseStartDate: string;
  monthlyRent: number;
  notes?: string;
  paymentStatus: PaymentStatus;
  propertyId: string;
  tenantId: string;
  unitId: string;
}): Lease {
  const now = new Date().toISOString();

  return {
    id: existingLeaseId ?? createLocalId("lease"),
    propertyId,
    unitId,
    tenantId,
    startDate: leaseStartDate,
    endDate: leaseEndDate,
    monthlyRent,
    paymentStatus: toRentPaymentStatus(paymentStatus),
    status: "active",
    notes: notes?.trim() ?? "",
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
}

function splitFullName(fullName: string) {
  const [firstName, ...lastNameParts] = fullName.trim().split(/\s+/);

  return {
    firstName: firstName || "",
    lastName: lastNameParts.join(" "),
  };
}

function getTenantDisplayName(tenant: Tenant) {
  return tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim();
}

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

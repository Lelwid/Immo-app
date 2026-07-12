import type { Lease, PaymentStatus, Tenant, Unit, UnitOccupancy } from "@/lib/types";

export type UnitOccupationSource = "lease" | "legacy" | "vacant";

export type UnitOccupationView = {
  unitId: string;
  propertyId: string;
  unitName: string;
  isOccupied: boolean;
  tenantId: string | null;
  tenantName: string;
  monthlyRent: number;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus: PaymentStatus;
  leaseStatus: Lease["status"] | "none";
  source: UnitOccupationSource;
};

export function getActiveLeaseForUnit(unitId: string, leases: Lease[]) {
  return (
    leases
      .filter((lease) => lease.unitId === unitId && lease.status === "active")
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? b.startDate).localeCompare(a.updatedAt ?? a.createdAt ?? a.startDate))[0] ??
    null
  );
}

export function getTenantForLease(lease: Lease | null, tenants: Tenant[]) {
  if (!lease) {
    return null;
  }

  return tenants.find((tenant) => tenant.id === lease.tenantId && !tenant.archivedAt) ?? null;
}

export function getUnitOccupancy(unit: Unit, leases: Lease[], tenants: Tenant[]): UnitOccupationView {
  const activeLease = getActiveLeaseForUnit(unit.id, leases);

  if (activeLease) {
    const tenant = getTenantForLease(activeLease, tenants);

    return {
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitName: unit.label,
      isOccupied: true,
      tenantId: activeLease.tenantId,
      tenantName: tenant ? getTenantName(tenant) : "Locataire introuvable",
      monthlyRent: activeLease.monthlyRent,
      leaseStartDate: activeLease.startDate,
      leaseEndDate: activeLease.endDate,
      paymentStatus: fromRentPaymentStatus(activeLease.paymentStatus),
      leaseStatus: activeLease.status,
      source: "lease",
    };
  }

  if (leases.some((lease) => lease.unitId === unit.id)) {
    return {
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitName: unit.label,
      isOccupied: false,
      tenantId: null,
      tenantName: "Vacant",
      monthlyRent: unit.monthlyRent,
      leaseStartDate: unit.leaseStartDate,
      leaseEndDate: unit.leaseEndDate,
      paymentStatus: unit.paymentStatus,
      leaseStatus: "none",
      source: "vacant",
    };
  }

  if (unit.tenantId) {
    const tenant = tenants.find((candidate) => candidate.id === unit.tenantId && !candidate.archivedAt) ?? null;

    return {
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitName: unit.label,
      isOccupied: true,
      tenantId: unit.tenantId,
      tenantName: tenant ? getTenantName(tenant) : "Locataire introuvable",
      monthlyRent: unit.monthlyRent,
      leaseStartDate: unit.leaseStartDate,
      leaseEndDate: unit.leaseEndDate,
      paymentStatus: unit.paymentStatus,
      leaseStatus: "active",
      source: "legacy",
    };
  }

  return {
    unitId: unit.id,
    propertyId: unit.propertyId,
    unitName: unit.label,
    isOccupied: false,
    tenantId: null,
    tenantName: "Vacant",
    monthlyRent: unit.monthlyRent,
    leaseStartDate: unit.leaseStartDate,
    leaseEndDate: unit.leaseEndDate,
    paymentStatus: unit.paymentStatus,
    leaseStatus: "none",
    source: "vacant",
  };
}

export function getUnitsWithOccupancy(units: Unit[], leases: Lease[], tenants: Tenant[]) {
  return units.map((unit) => ({
    unit,
    occupancy: getUnitOccupancy(unit, leases, tenants),
  }));
}

export function buildUnitOccupancy(unit: Unit, leases: Lease[], tenants: Tenant[]): UnitOccupancy {
  const activeLease = getActiveLeaseForUnit(unit.id, leases);

  return {
    unit,
    activeLease,
    tenant: getTenantForLease(activeLease, tenants),
  };
}

export function applyActiveLeaseToLegacyUnit(unit: Unit, lease: Lease | null): Unit {
  if (!lease) {
    return {
      ...unit,
      tenantId: null,
    };
  }

  return {
    ...unit,
    tenantId: lease.tenantId,
    monthlyRent: lease.monthlyRent,
    leaseStartDate: lease.startDate,
    leaseEndDate: lease.endDate,
    paymentStatus: lease.paymentStatus === "payé" ? "paid" : lease.paymentStatus === "en retard" ? "late" : "dueSoon",
    notes: lease.notes ?? unit.notes,
  };
}

export function applyOccupationToLegacyUnit(unit: Unit, occupancy: UnitOccupationView): Unit {
  return {
    ...unit,
    tenantId: occupancy.tenantId,
    monthlyRent: occupancy.monthlyRent,
    leaseStartDate: occupancy.leaseStartDate,
    leaseEndDate: occupancy.leaseEndDate,
    paymentStatus: occupancy.paymentStatus,
  };
}

function getTenantName(tenant: Tenant) {
  return tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim();
}

function fromRentPaymentStatus(status: Lease["paymentStatus"]): PaymentStatus {
  if (status === "payé") {
    return "paid";
  }

  if (status === "en retard") {
    return "late";
  }

  return "dueSoon";
}

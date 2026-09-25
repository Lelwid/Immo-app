import type { Lease, PaymentStatus, Tenant, Unit, UnitOccupancy } from "@/lib/types";

export type UnitOccupationSource = "lease" | "future" | "legacy" | "vacant";

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

export function isLeaseCurrent(lease: Lease, today = new Date().toISOString().slice(0, 10)) {
  if (lease.status !== "active" || lease.startDate > today) {
    return false;
  }

  const effectiveEndDate = lease.actualEndDate || lease.endDate;
  return !effectiveEndDate || effectiveEndDate >= today;
}

export function getCurrentLeaseForUnit(unitId: string, leases: Lease[], today?: string) {
  return (
    leases
      .filter((lease) => lease.unitId === unitId && isLeaseCurrent(lease, today))
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
  const activeLease = getCurrentLeaseForUnit(unit.id, leases);

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

  const futureLease = getActiveLeaseForUnit(unit.id, leases);

  if (futureLease && futureLease.startDate > new Date().toISOString().slice(0, 10)) {
    const tenant = getTenantForLease(futureLease, tenants);

    return {
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitName: unit.label,
      isOccupied: false,
      tenantId: futureLease.tenantId,
      tenantName: tenant ? getTenantName(tenant) : "Locataire introuvable",
      monthlyRent: futureLease.monthlyRent,
      leaseStartDate: futureLease.startDate,
      leaseEndDate: futureLease.endDate,
      paymentStatus: fromRentPaymentStatus(futureLease.paymentStatus),
      leaseStatus: futureLease.status,
      source: "future",
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

export function getTenantOccupancy(tenantId: string, units: Unit[], leases: Lease[], tenants: Tenant[]): UnitOccupationView | null {
  const activeLease = leases.find((lease) => lease.tenantId === tenantId && lease.status === "active");

  if (activeLease) {
    const activeUnit = units.find((unit) => unit.id === activeLease.unitId);
    return activeUnit ? getUnitOccupancy(activeUnit, leases, tenants) : null;
  }

  const latestLease = leases
    .filter((lease) => lease.tenantId === tenantId)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const unit = latestLease ? units.find((candidate) => candidate.id === latestLease.unitId) : null;
  const tenant = tenants.find((candidate) => candidate.id === tenantId) ?? null;

  if (!latestLease || !unit) {
    return null;
  }

  return {
    unitId: unit.id,
    propertyId: unit.propertyId,
    unitName: unit.label,
    isOccupied: false,
    tenantId,
    tenantName: tenant ? getTenantName(tenant) : "Locataire introuvable",
    monthlyRent: latestLease.monthlyRent,
    leaseStartDate: latestLease.startDate,
    leaseEndDate: latestLease.endDate,
    paymentStatus: fromRentPaymentStatus(latestLease.paymentStatus),
    leaseStatus: latestLease.status,
    source: "lease",
  };
}

export function getUnitsWithOccupancy(units: Unit[], leases: Lease[], tenants: Tenant[]) {
  return units.map((unit) => ({
    unit,
    occupancy: getUnitOccupancy(unit, leases, tenants),
  }));
}

export function buildUnitOccupancy(unit: Unit, leases: Lease[], tenants: Tenant[]): UnitOccupancy {
  const activeLease = getCurrentLeaseForUnit(unit.id, leases);

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

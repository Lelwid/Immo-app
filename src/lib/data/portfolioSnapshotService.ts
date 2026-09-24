import { getActivities } from "@/lib/data/activitiesService";
import { getDocuments } from "@/lib/data/documentsService";
import { getLeases } from "@/lib/data/leasesService";
import { getMaintenanceRequests } from "@/lib/data/maintenanceService";
import { getNotes } from "@/lib/data/notesService";
import { getPayments } from "@/lib/data/paymentsService";
import { getProperties } from "@/lib/data/propertiesService";
import { getPaymentAllocations, getPaymentTransactions, getRentCharges } from "@/lib/data/rentLedgerService";
import { getTasks } from "@/lib/data/tasksService";
import { getTenants } from "@/lib/data/tenantsService";
import { getUnits } from "@/lib/data/unitsService";
import type { LocalStore, MaintenanceTicket, Unit } from "@/lib/types";

export type PortfolioSnapshot = LocalStore & {
  maintenanceRequests: MaintenanceTicket[];
  loadedAt: string;
};

const cacheTtlMs = 15_000;
let cachedSnapshot: PortfolioSnapshot | null = null;
let cachedAt = 0;
let pendingSnapshot: Promise<PortfolioSnapshot> | null = null;
let snapshotGeneration = 0;

export async function loadPortfolioSnapshot(options: { force?: boolean } = {}): Promise<PortfolioSnapshot> {
  const now = Date.now();

  if (!options.force && cachedSnapshot && now - cachedAt < cacheTtlMs) {
    return cachedSnapshot;
  }

  if (!options.force && pendingSnapshot) {
    return pendingSnapshot;
  }

  const requestGeneration = snapshotGeneration;
  const request = fetchPortfolioSnapshot()
    .then((snapshot) => {
      if (requestGeneration === snapshotGeneration) {
        cachedSnapshot = snapshot;
        cachedAt = Date.now();
      }
      return snapshot;
    })
    .finally(() => {
      if (pendingSnapshot === request) {
        pendingSnapshot = null;
      }
    });

  pendingSnapshot = request;
  return pendingSnapshot;
}

export async function refreshSnapshot(): Promise<PortfolioSnapshot> {
  return loadPortfolioSnapshot({ force: true });
}

export function clearPortfolioSnapshotCache() {
  snapshotGeneration += 1;
  cachedSnapshot = null;
  cachedAt = 0;
  pendingSnapshot = null;
}

async function fetchPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  try {
    const [
      properties,
      units,
      tenants,
      leases,
      payments,
      notes,
      activities,
      documents,
      maintenanceRequests,
      tasks,
      rentCharges,
      paymentTransactions,
      paymentAllocations,
    ] = await Promise.all([
      loadSnapshotDomain("properties", getProperties),
      loadSnapshotDomain("units", getUnits),
      loadSnapshotDomain("tenants", getTenants),
      loadSnapshotDomain("leases", getLeases),
      loadSnapshotDomain("payments", getPayments),
      loadSnapshotDomain("notes", getNotes),
      loadSnapshotDomain("activities", getActivities),
      loadSnapshotDomain("documents", getDocuments),
      loadSnapshotDomain("maintenanceRequests", getMaintenanceRequests),
      loadSnapshotDomain("tasks", getTasks),
      loadSnapshotDomain("rentCharges", getRentCharges),
      loadSnapshotDomain("paymentTransactions", getPaymentTransactions),
      loadSnapshotDomain("paymentAllocations", getPaymentAllocations),
    ]);

    return normalizeSnapshot({
      properties,
      units,
      tenants,
      leases,
      payments,
      notes,
      activities,
      documents,
      maintenanceTickets: maintenanceRequests,
      rentCharges,
      paymentTransactions,
      paymentAllocations,
      tasks,
    });
  } catch (error) {
    console.error("Impossible de charger l'instantané du portefeuille.", serializeSnapshotError(error));
    throw createPortfolioSnapshotError(error);
  }
}

async function loadSnapshotDomain<T>(domain: string, loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    console.error(`[portfolioSnapshotService] Domaine impossible à charger: ${domain}.`, {
      domain,
      ...serializeSnapshotError(error),
    });
    throw createPortfolioDomainError(domain, error);
  }
}

function createPortfolioDomainError(domain: string, cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  const error = new Error(process.env.NODE_ENV === "development" ? `Impossible de charger le domaine ${domain}. ${message}` : "Impossible de charger les données du portefeuille.");
  (error as Error & { cause?: unknown; domain?: string }).cause = cause;
  (error as Error & { domain?: string }).domain = domain;
  return error;
}

function createPortfolioSnapshotError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  const error = new Error(process.env.NODE_ENV === "development" ? `Impossible de charger les données du portefeuille. ${message}` : "Impossible de charger les données du portefeuille.");
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function serializeSnapshotError(error: unknown) {
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : null;
  const source = isStructuredSupabaseCause(cause) ? cause : isStructuredSupabaseCause(error) ? error : null;

  if (source) {
    return {
      message: source.message ?? (error instanceof Error ? error.message : String(error)),
      code: source.code ?? null,
      details: source.details ?? null,
      hint: source.hint ?? null,
      operation: source.operation,
      table: source.table,
      selectedColumns: source.selectedColumns,
      filters: source.filters,
    };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    code: null,
    details: null,
    hint: null,
  };
}

function isStructuredSupabaseCause(value: unknown): value is {
  code?: string | null;
  details?: string | null;
  filters?: string[];
  hint?: string | null;
  message?: string;
  operation?: string;
  selectedColumns?: string;
  table?: string;
} {
  return Boolean(value && typeof value === "object" && ("message" in value || "code" in value || "details" in value || "hint" in value));
}

function normalizeSnapshot(store: LocalStore): PortfolioSnapshot {
  const properties = uniqueById(store.properties);
  const propertyIds = new Set(properties.map((property) => property.id));
  const allLeases = uniqueById(store.leases);
  const leases = allLeases.filter((item) => propertyIds.has(item.propertyId));
  const leaseTenantIds = new Set(allLeases.map((lease) => lease.tenantId));
  const activePropertyTenantIds = new Set(leases.map((lease) => lease.tenantId));
  const units = uniqueById(store.units).filter((item) => propertyIds.has(item.propertyId)).sort(compareUnits);
  const tenants = uniqueById(store.tenants).filter((tenant) => !leaseTenantIds.has(tenant.id) || activePropertyTenantIds.has(tenant.id));
  const payments = uniqueById(store.payments).filter((item) => propertyIds.has(item.propertyId));
  const rentCharges = uniqueById(store.rentCharges ?? []).filter((item) => propertyIds.has(item.propertyId));
  const paymentTransactions = uniqueById(store.paymentTransactions ?? []).filter((item) => propertyIds.has(item.propertyId));
  const transactionIds = new Set(paymentTransactions.map((item) => item.id));
  const chargeIds = new Set(rentCharges.map((item) => item.id));
  const paymentAllocations = uniqueById(store.paymentAllocations ?? []).filter(
    (item) => transactionIds.has(item.transactionId) && chargeIds.has(item.rentChargeId),
  );
  const notes = uniqueById(store.notes).filter((item) => !item.propertyId || propertyIds.has(item.propertyId));
  const activities = uniqueById(store.activities).filter((item) => !item.propertyId || propertyIds.has(item.propertyId));
  const documents = uniqueById(store.documents).filter((item) => propertyIds.has(item.propertyId));
  const maintenanceRequests = uniqueById(store.maintenanceTickets).filter((item) => propertyIds.has(item.propertyId));
  const tasks = uniqueById(store.tasks).filter((item) => !item.propertyId || propertyIds.has(item.propertyId));

  return {
    properties,
    units,
    tenants,
    leases,
    payments,
    rentCharges,
    paymentTransactions,
    paymentAllocations,
    notes,
    activities,
    documents,
    maintenanceTickets: maintenanceRequests,
    maintenanceRequests,
    tasks,
    loadedAt: new Date().toISOString(),
  };
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function compareUnits(a: Unit, b: Unit) {
  if (a.propertyId !== b.propertyId) {
    return a.propertyId.localeCompare(b.propertyId);
  }

  const orderDifference = getUnitNumber(a.label) - getUnitNumber(b.label);

  if (orderDifference !== 0) {
    return orderDifference;
  }

  return a.label.localeCompare(b.label, "fr-CA", { numeric: true });
}

function getUnitNumber(label: string) {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

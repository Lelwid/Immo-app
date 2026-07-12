import { getActivities } from "@/lib/data/activitiesService";
import { getDocuments } from "@/lib/data/documentsService";
import { getLeases } from "@/lib/data/leasesService";
import { getMaintenanceRequests } from "@/lib/data/maintenanceService";
import { getNotes } from "@/lib/data/notesService";
import { getPayments } from "@/lib/data/paymentsService";
import { getProperties } from "@/lib/data/propertiesService";
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

export async function loadPortfolioSnapshot(options: { force?: boolean } = {}): Promise<PortfolioSnapshot> {
  const now = Date.now();

  if (!options.force && cachedSnapshot && now - cachedAt < cacheTtlMs) {
    return cachedSnapshot;
  }

  if (!options.force && pendingSnapshot) {
    return pendingSnapshot;
  }

  pendingSnapshot = fetchPortfolioSnapshot()
    .then((snapshot) => {
      cachedSnapshot = snapshot;
      cachedAt = Date.now();
      return snapshot;
    })
    .finally(() => {
      pendingSnapshot = null;
    });

  return pendingSnapshot;
}

export async function refreshSnapshot(): Promise<PortfolioSnapshot> {
  return loadPortfolioSnapshot({ force: true });
}

export function clearPortfolioSnapshotCache() {
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
    ] = await Promise.all([
      getProperties(),
      getUnits(),
      getTenants(),
      getLeases(),
      getPayments(),
      getNotes(),
      getActivities(),
      getDocuments(),
      getMaintenanceRequests(),
      getTasks(),
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
      tasks,
    });
  } catch (error) {
    console.error("Impossible de charger l'instantané du portefeuille.", error);
    throw new Error("Impossible de charger les données du portefeuille.");
  }
}

function normalizeSnapshot(store: LocalStore): PortfolioSnapshot {
  const properties = uniqueById(store.properties);
  const units = uniqueById(store.units).sort(compareUnits);
  const tenants = uniqueById(store.tenants);
  const leases = uniqueById(store.leases);
  const payments = uniqueById(store.payments);
  const notes = uniqueById(store.notes);
  const activities = uniqueById(store.activities);
  const documents = uniqueById(store.documents);
  const maintenanceRequests = uniqueById(store.maintenanceTickets);
  const tasks = uniqueById(store.tasks);

  return {
    properties,
    units,
    tenants,
    leases,
    payments,
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

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRentLedger, getRentLedgerSummary, type RentChargeRow } from "@/lib/data/rentLedgerService";
import type {
  ActivityType,
  AppNote,
  AppTask,
  DocumentRelatedEntityType,
  DocumentType,
  Lease,
  LocalStore,
  MaintenanceTicket,
  PaymentAllocation,
  PaymentMethod,
  PaymentRecord,
  PaymentTransaction,
  Property,
  PropertyDocument,
  RentCharge,
  RentPaymentStatus,
  TaskPriority,
  Tenant,
  TicketPriority,
  TicketStatus,
  Unit,
  UnitActivity,
} from "@/lib/types";

export type CopilotEntityContext = {
  id?: string | null;
  type?: "property" | "unit" | "tenant" | "lease" | null;
};

type CopilotDataSource =
  | {
      localStore: LocalStore;
      mode: "local";
      userId?: string | null;
    }
  | {
      mode: "supabase";
      supabase: SupabaseClient;
      userId: string;
    };

type Domain =
  | "activities"
  | "documents"
  | "leases"
  | "maintenanceTickets"
  | "notes"
  | "paymentAllocations"
  | "paymentTransactions"
  | "payments"
  | "properties"
  | "rentCharges"
  | "tasks"
  | "tenants"
  | "units";

type ToolDefinition = {
  description: string;
  name: string;
  parameters: {
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
    type: "object";
  };
  type: "function";
};

const domainList: Domain[] = [
  "properties",
  "units",
  "tenants",
  "leases",
  "maintenanceTickets",
  "activities",
  "documents",
  "payments",
  "rentCharges",
  "paymentTransactions",
  "paymentAllocations",
  "notes",
  "tasks",
];

const rentDomains: Domain[] = ["properties", "units", "tenants", "leases", "payments", "rentCharges", "paymentTransactions", "paymentAllocations"];
const portfolioDomains: Domain[] = [...domainList];
const todayIso = () => new Date().toISOString().slice(0, 10);
const currencyFormatter = new Intl.NumberFormat("fr-CA", {
  currency: "CAD",
  maximumFractionDigits: 0,
  style: "currency",
});
const dateFormatter = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export const copilotToolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    name: "get_current_context",
    description: "Résume l'entité actuellement consultée dans l'application, si une page fournit un contexte.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_portfolio_summary",
    description: "Retourne les principaux indicateurs du portefeuille immobilier.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "find_tenant",
    description: "Recherche un locataire par nom, courriel ou téléphone. À utiliser avant de répondre à une question sur une personne nommée.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Nom, courriel ou téléphone recherché." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "find_property",
    description: "Recherche un immeuble par nom, adresse ou ville.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Nom, adresse ou ville recherché." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_tenant_summary",
    description: "Retourne le bail actif, le logement, le solde locatif, les documents et les demandes d'entretien d'un locataire.",
    parameters: {
      type: "object",
      properties: { tenantId: { type: "string", description: "Identifiant du locataire." } },
      required: ["tenantId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_property_summary",
    description: "Retourne les revenus, l'occupation, les loyers, les documents et les demandes d'entretien d'un immeuble.",
    parameters: {
      type: "object",
      properties: { propertyId: { type: "string", description: "Identifiant de l'immeuble." } },
      required: ["propertyId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_unit_summary",
    description: "Retourne l'occupation, le bail actif et l'état locatif d'un logement.",
    parameters: {
      type: "object",
      properties: { unitId: { type: "string", description: "Identifiant du logement." } },
      required: ["unitId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_lease_summary",
    description: "Retourne les dates, le statut, le locataire, le solde et les documents d'un bail.",
    parameters: {
      type: "object",
      properties: { leaseId: { type: "string", description: "Identifiant du bail." } },
      required: ["leaseId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_overdue_rent",
    description: "Liste les loyers en retard à partir du registre des loyers et des allocations de paiement.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "get_vacant_units",
    description: "Liste les logements vacants, avec filtre optionnel par immeuble.",
    parameters: {
      type: "object",
      properties: { propertyId: { type: "string", description: "Identifiant optionnel de l'immeuble." } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_upcoming_lease_expirations",
    description: "Liste les baux actifs qui expirent dans un nombre de jours donné.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Fenêtre en jours. Défaut: 60." } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_recent_activity",
    description: "Retourne les dernières activités du portefeuille.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number", description: "Nombre maximal d'activités. Défaut: 8." } },
      required: [],
      additionalProperties: false,
    },
  },
];

export function createCopilotToolRunner(source: CopilotDataSource, pageContext: CopilotEntityContext | null | undefined) {
  const loadStore = createPortfolioLoader(source);

  return async function runCopilotTool(name: string, rawArgs: Record<string, unknown>) {
    const args = rawArgs ?? {};

    switch (name) {
      case "get_current_context":
        return getCurrentContext(await loadStore(portfolioDomains), pageContext);
      case "get_portfolio_summary":
        return getPortfolioSummaryResult(await loadStore(portfolioDomains));
      case "find_tenant":
        return findTenant(await loadStore(["tenants", "leases", "units", "properties"]), getString(args.query));
      case "find_property":
        return findProperty(await loadStore(["properties"]), getString(args.query));
      case "get_tenant_summary":
        return getTenantSummary(await loadStore(portfolioDomains), getString(args.tenantId));
      case "get_property_summary":
        return getPropertySummary(await loadStore(portfolioDomains), getString(args.propertyId));
      case "get_unit_summary":
        return getUnitSummary(await loadStore(portfolioDomains), getString(args.unitId));
      case "get_lease_summary":
        return getLeaseSummary(await loadStore(portfolioDomains), getString(args.leaseId));
      case "get_overdue_rent":
        return getOverdueRent(await loadStore(rentDomains));
      case "get_vacant_units":
        return getVacantUnits(await loadStore(["properties", "units", "tenants", "leases"]), optionalString(args.propertyId));
      case "get_upcoming_lease_expirations":
        return getUpcomingLeaseExpirations(await loadStore(["properties", "units", "tenants", "leases"]), getNumber(args.days, 60));
      case "get_recent_activity":
        return getRecentActivity(await loadStore(["activities", "properties", "units", "tenants", "leases"]), getNumber(args.limit, 8));
      default:
        return { error: `Outil inconnu: ${name}` };
    }
  };
}

function createPortfolioLoader(source: CopilotDataSource) {
  const cache = new Map<string, Promise<LocalStore>>();

  return (domains: Domain[]) => {
    const uniqueDomains = Array.from(new Set(domains)).sort() as Domain[];
    const key = uniqueDomains.join("|");
    const cached = cache.get(key);

    if (cached) {
      return cached;
    }

    const promise = source.mode === "local" ? Promise.resolve(normalizeLocalStore(source.localStore, uniqueDomains)) : loadSupabaseStore(source.supabase, source.userId, uniqueDomains);
    cache.set(key, promise);
    return promise;
  };
}

async function loadSupabaseStore(supabase: SupabaseClient, userId: string, domains: Domain[]): Promise<LocalStore> {
  const store = createEmptyStore();
  const domainSet = new Set(domains);

  await Promise.all([
    domainSet.has("properties") ? selectRows(supabase.from("properties").select("*").eq("user_id", userId), "properties").then((rows) => (store.properties = rows.map(mapProperty))) : null,
    domainSet.has("units") ? selectRows(supabase.from("units").select("*"), "units").then((rows) => (store.units = rows.map(mapUnit))) : null,
    domainSet.has("tenants") ? selectRows(supabase.from("tenants").select("*").eq("user_id", userId), "tenants").then((rows) => (store.tenants = rows.map(mapTenant))) : null,
    domainSet.has("leases") ? selectRows(supabase.from("leases").select("*").order("start_date", { ascending: false }), "leases").then((rows) => (store.leases = rows.map(mapLease))) : null,
    domainSet.has("maintenanceTickets") ? selectRows(supabase.from("maintenance_requests").select("*").eq("user_id", userId), "maintenance_requests").then((rows) => (store.maintenanceTickets = rows.map(mapMaintenanceTicket))) : null,
    domainSet.has("activities") ? selectRows(supabase.from("activities").select("*").eq("user_id", userId).order("created_at", { ascending: false }), "activities").then((rows) => (store.activities = rows.map(mapActivity))) : null,
    domainSet.has("documents") ? selectRows(supabase.from("documents").select("*").eq("user_id", userId), "documents").then((rows) => (store.documents = rows.map(mapDocument))) : null,
    domainSet.has("payments") ? selectRows(supabase.from("payments").select("*").eq("user_id", userId), "payments").then((rows) => (store.payments = rows.map(mapPayment))) : null,
    domainSet.has("rentCharges") ? selectRows(supabase.from("rent_charges").select("*").eq("user_id", userId), "rent_charges").then((rows) => (store.rentCharges = rows.map(mapRentCharge))) : null,
    domainSet.has("paymentTransactions")
      ? selectRows(supabase.from("payment_transactions").select("*").eq("user_id", userId), "payment_transactions").then((rows) => (store.paymentTransactions = rows.map(mapPaymentTransaction)))
      : null,
    domainSet.has("paymentAllocations")
      ? selectRows(supabase.from("payment_allocations").select("*").eq("user_id", userId), "payment_allocations").then((rows) => (store.paymentAllocations = rows.map(mapPaymentAllocation)))
      : null,
    domainSet.has("notes") ? selectRows(supabase.from("notes").select("*").eq("user_id", userId), "notes").then((rows) => (store.notes = rows.map(mapNote))) : null,
    domainSet.has("tasks") ? selectRows(supabase.from("tasks").select("*").eq("user_id", userId), "tasks").then((rows) => (store.tasks = rows.map(mapTask))) : null,
  ]);

  return normalizeLocalStore(store, domains);
}

async function selectRows(query: PromiseLike<{ data: unknown[] | null; error: { code?: string; details?: string; hint?: string; message?: string } | null }>, table: string) {
  const { data, error } = await query;

  if (error) {
    console.error(
      "[Nexbail Copilot] Lecture Supabase échouée.",
      process.env.NODE_ENV === "production"
        ? { code: error.code, table }
        : { code: error.code, details: error.details, hint: error.hint, message: error.message, table },
    );
    throw new Error(`Impossible de charger ${table}.`);
  }

  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function normalizeLocalStore(store: LocalStore, domains: Domain[]) {
  const normalized = createEmptyStore();

  for (const domain of domains) {
    copyDomain(normalized, store, domain);
  }

  return normalized;
}

function copyDomain(target: LocalStore, source: LocalStore, domain: Domain) {
  switch (domain) {
    case "activities":
      target.activities = dedupeById(source.activities ?? []);
      break;
    case "documents":
      target.documents = dedupeById(source.documents ?? []);
      break;
    case "leases":
      target.leases = dedupeById(source.leases ?? []);
      break;
    case "maintenanceTickets":
      target.maintenanceTickets = dedupeById(source.maintenanceTickets ?? []);
      break;
    case "notes":
      target.notes = dedupeById(source.notes ?? []);
      break;
    case "paymentAllocations":
      target.paymentAllocations = dedupeById(source.paymentAllocations ?? []);
      break;
    case "paymentTransactions":
      target.paymentTransactions = dedupeById(source.paymentTransactions ?? []);
      break;
    case "payments":
      target.payments = dedupeById(source.payments ?? []);
      break;
    case "properties":
      target.properties = dedupeById(source.properties ?? []);
      break;
    case "rentCharges":
      target.rentCharges = dedupeById(source.rentCharges ?? []);
      break;
    case "tasks":
      target.tasks = dedupeById(source.tasks ?? []);
      break;
    case "tenants":
      target.tenants = dedupeById(source.tenants ?? []);
      break;
    case "units":
      target.units = dedupeById(source.units ?? []);
      break;
  }
}

function createEmptyStore(): LocalStore {
  return {
    activities: [],
    documents: [],
    leases: [],
    maintenanceTickets: [],
    notes: [],
    paymentAllocations: [],
    paymentTransactions: [],
    payments: [],
    properties: [],
    rentCharges: [],
    tasks: [],
    tenants: [],
    units: [],
  };
}

function getCurrentContext(store: LocalStore, context: CopilotEntityContext | null | undefined) {
  if (!context?.type || !context.id) {
    return { context: null, message: "Aucun contexte de page précis." };
  }

  if (context.type === "tenant") {
    return getTenantSummary(store, context.id);
  }

  if (context.type === "property") {
    return getPropertySummary(store, context.id);
  }

  if (context.type === "unit") {
    return getUnitSummary(store, context.id);
  }

  if (context.type === "lease") {
    return getLeaseSummary(store, context.id);
  }

  return { context: null, message: "Contexte de page non reconnu." };
}

function getPortfolioSummaryResult(store: LocalStore) {
  const ledger = buildRentLedger(store, todayIso());
  const summary = getRentLedgerSummary(ledger, todayIso().slice(0, 7), todayIso());
  const activeLeases = store.leases.filter((lease) => lease.status === "active");
  const occupiedUnitIds = new Set(activeLeases.map((lease) => lease.unitId));
  const openMaintenance = store.maintenanceTickets.filter((ticket) => ticket.status !== "resolved");
  const overdueTasks = store.tasks.filter((task) => !task.completed && task.dueDate && task.dueDate < todayIso());

  return {
    counts: {
      activeLeases: activeLeases.length,
      documents: store.documents.filter(hasRealDocumentFile).length,
      maintenanceOpen: openMaintenance.length,
      properties: store.properties.length,
      tasksOverdue: overdueTasks.length,
      tenants: store.tenants.length,
      units: store.units.length,
      vacantUnits: store.units.filter((unit) => !occupiedUnitIds.has(unit.id)).length,
    },
    rentLedger: summary,
    recentActivity: getRecentActivity(store, 5).activities,
  };
}

function findTenant(store: LocalStore, query: string) {
  const normalizedQuery = normalizeSearch(query);
  const candidates = store.tenants
    .filter((tenant) => {
      const text = normalizeSearch([getTenantDisplayName(tenant), tenant.email, tenant.phone].join(" "));
      return text.includes(normalizedQuery);
    })
    .map((tenant) => {
      const activeLease = findActiveLeaseForTenant(store, tenant.id);
      return {
        id: tenant.id,
        name: getTenantDisplayName(tenant),
        email: tenant.email,
        phone: tenant.phone,
        activeLease: activeLease ? summarizeLeaseContext(store, activeLease) : null,
      };
    });

  return {
    candidates,
    matchCount: candidates.length,
    status: candidates.length === 0 ? "not_found" : candidates.length === 1 ? "single_match" : "ambiguous",
  };
}

function findProperty(store: LocalStore, query: string) {
  const normalizedQuery = normalizeSearch(query);
  const candidates = store.properties
    .filter((property) => {
      const text = normalizeSearch([property.name, property.address, property.city, property.postalCode].join(" "));
      return text.includes(normalizedQuery);
    })
    .map((property) => ({
      address: formatPropertyAddress(property),
      id: property.id,
      name: property.name,
      type: property.propertyType,
      unitCount: store.units.filter((unit) => unit.propertyId === property.id).length,
    }));

  return {
    candidates,
    matchCount: candidates.length,
    status: candidates.length === 0 ? "not_found" : candidates.length === 1 ? "single_match" : "ambiguous",
  };
}

function getTenantSummary(store: LocalStore, tenantId: string) {
  const tenant = store.tenants.find((candidate) => candidate.id === tenantId);

  if (!tenant) {
    return { error: "Locataire introuvable.", tenantId };
  }

  const activeLease = findActiveLeaseForTenant(store, tenant.id);
  const unit = activeLease ? findUnit(store, activeLease.unitId) : null;
  const property = activeLease ? findPropertyById(store, activeLease.propertyId) : null;
  const rentStatus = getTenantRentStatus(store, tenant.id);
  const documents = store.documents.filter((document) => document.tenantId === tenant.id || Boolean(activeLease && document.leaseId === activeLease.id)).map(summarizeDocument);
  const maintenance = store.maintenanceTickets.filter((ticket) => ticket.unitId && ticket.unitId === activeLease?.unitId && ticket.status !== "resolved").map(summarizeMaintenance);

  return {
    activeLease: activeLease ? summarizeLease(activeLease, store) : null,
    documents,
    maintenance,
    property: property ? summarizeProperty(property) : null,
    rentStatus,
    tenant: {
      email: tenant.email,
      id: tenant.id,
      name: getTenantDisplayName(tenant),
      phone: tenant.phone,
    },
    unit: unit ? summarizeUnit(unit) : null,
  };
}

function getPropertySummary(store: LocalStore, propertyId: string) {
  const property = findPropertyById(store, propertyId);

  if (!property) {
    return { error: "Immeuble introuvable.", propertyId };
  }

  const units = store.units.filter((unit) => unit.propertyId === property.id);
  const activeLeases = store.leases.filter((lease) => lease.propertyId === property.id && lease.status === "active");
  const occupiedUnitIds = new Set(activeLeases.map((lease) => lease.unitId));
  const ledger = buildRentLedger(store, todayIso());
  const propertyRows = ledger.rows.filter((row) => row.propertyId === property.id);
  const propertyTransactions = ledger.transactions.filter((transaction) => transaction.propertyId === property.id);
  const openMaintenance = store.maintenanceTickets.filter((ticket) => ticket.propertyId === property.id && ticket.status !== "resolved");

  return {
    activeLeases: activeLeases.length,
    documentsWithFiles: store.documents.filter((document) => document.propertyId === property.id && hasRealDocumentFile(document)).length,
    maintenanceOpen: openMaintenance.map(summarizeMaintenance),
    monthlyExpectedRent: propertyRows.filter((row) => row.periodMonth === todayIso().slice(0, 7)).reduce((sum, row) => sum + row.amountDue, 0),
    overdueRent: summarizeChargeRows(propertyRows.filter((row) => row.balance > 0 && row.dueDate < todayIso()), store),
    property: summarizeProperty(property),
    receivedThisMonth: propertyTransactions.filter((transaction) => transaction.receivedAt.slice(0, 7) === todayIso().slice(0, 7)).reduce((sum, transaction) => sum + transaction.amountReceived, 0),
    units: {
      occupied: units.filter((unit) => occupiedUnitIds.has(unit.id)).length,
      total: units.length,
      vacant: units.filter((unit) => !occupiedUnitIds.has(unit.id)).map(summarizeUnit),
    },
  };
}

function getUnitSummary(store: LocalStore, unitId: string) {
  const unit = findUnit(store, unitId);

  if (!unit) {
    return { error: "Logement introuvable.", unitId };
  }

  const property = findPropertyById(store, unit.propertyId);
  const activeLease = store.leases.find((lease) => lease.unitId === unit.id && lease.status === "active") ?? null;
  const tenant = activeLease ? store.tenants.find((candidate) => candidate.id === activeLease.tenantId) ?? null : null;
  const ledger = buildRentLedger(store, todayIso());
  const rows = ledger.rows.filter((row) => row.unitId === unit.id);

  return {
    activeLease: activeLease ? summarizeLease(activeLease, store) : null,
    documents: store.documents.filter((document) => document.unitId === unit.id || Boolean(activeLease && document.leaseId === activeLease.id)).map(summarizeDocument),
    maintenanceOpen: store.maintenanceTickets.filter((ticket) => ticket.unitId === unit.id && ticket.status !== "resolved").map(summarizeMaintenance),
    property: property ? summarizeProperty(property) : null,
    rent: summarizeChargeRows(rows.filter((row) => row.balance > 0 || row.periodMonth === todayIso().slice(0, 7)).slice(0, 8), store),
    tenant: tenant ? { id: tenant.id, name: getTenantDisplayName(tenant) } : null,
    unit: summarizeUnit(unit),
    vacancy: activeLease ? "occupé" : "vacant",
  };
}

function getLeaseSummary(store: LocalStore, leaseId: string) {
  const lease = store.leases.find((candidate) => candidate.id === leaseId);

  if (!lease) {
    return { error: "Bail introuvable.", leaseId };
  }

  const ledger = buildRentLedger(store, todayIso());
  const rows = ledger.rows.filter((row) => row.leaseId === lease.id);

  return {
    documents: store.documents.filter((document) => document.leaseId === lease.id || document.unitId === lease.unitId || document.tenantId === lease.tenantId).map(summarizeDocument),
    lease: summarizeLease(lease, store),
    rent: {
      charges: summarizeChargeRows(rows, store),
      totalBalance: rows.reduce((sum, row) => sum + row.balance, 0),
      totalPaid: rows.reduce((sum, row) => sum + row.amountAllocated, 0),
    },
  };
}

function getOverdueRent(store: LocalStore) {
  const ledger = buildRentLedger(store, todayIso());
  const rows = ledger.rows.filter((row) => row.balance > 0 && row.dueDate < todayIso()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    count: rows.length,
    totalBalance: rows.reduce((sum, row) => sum + row.balance, 0),
    rows: summarizeChargeRows(rows, store),
  };
}

function getVacantUnits(store: LocalStore, propertyId: string | null) {
  const activeUnitIds = new Set(store.leases.filter((lease) => lease.status === "active").map((lease) => lease.unitId));
  const units = store.units
    .filter((unit) => !propertyId || unit.propertyId === propertyId)
    .filter((unit) => !activeUnitIds.has(unit.id))
    .map((unit) => ({
      ...summarizeUnit(unit),
      property: summarizeNullableProperty(store, unit.propertyId),
    }));

  return {
    count: units.length,
    units,
  };
}

function getUpcomingLeaseExpirations(store: LocalStore, days: number) {
  const today = todayIso();
  const maxDate = addDaysIso(today, Math.max(1, Math.min(days, 365)));
  const leases = store.leases
    .filter((lease) => lease.status === "active" && lease.endDate >= today && lease.endDate <= maxDate)
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map((lease) => summarizeLease(lease, store));

  return {
    count: leases.length,
    days,
    leases,
  };
}

function getRecentActivity(store: LocalStore, limit: number) {
  const activities = store.activities
    .slice()
    .sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date))
    .slice(0, Math.max(1, Math.min(limit, 20)))
    .map((activity) => ({
      date: activity.date,
      description: activity.description,
      id: activity.id,
      lease: activity.leaseId ? summarizeLeaseContextById(store, activity.leaseId) : null,
      property: activity.propertyId ? summarizeNullableProperty(store, activity.propertyId) : null,
      tenant: activity.tenantId ? summarizeNullableTenant(store, activity.tenantId) : null,
      title: activity.title,
      type: activity.type,
      unit: activity.unitId ? summarizeNullableUnit(store, activity.unitId) : null,
    }));

  return { activities };
}

function getTenantRentStatus(store: LocalStore, tenantId: string) {
  const activeLease = findActiveLeaseForTenant(store, tenantId);

  if (!activeLease) {
    return { label: "Aucun loyer actif", reason: "Aucun bail actif lié à ce locataire." };
  }

  const ledger = buildRentLedger(store, todayIso());
  const rows = ledger.rows.filter((row) => row.tenantId === tenantId && row.leaseId === activeLease.id);
  const currentMonth = todayIso().slice(0, 7);
  const overdue = rows.filter((row) => row.balance > 0 && row.dueDate < todayIso()).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const partialCurrent = rows.find((row) => row.periodMonth === currentMonth && row.status === "partiel");
  const current = rows.find((row) => row.periodMonth === currentMonth);
  const future = rows.filter((row) => row.balance > 0 && row.dueDate >= todayIso()).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const paidCurrent = rows
    .filter((row) => row.periodMonth === currentMonth && row.balance === 0)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  const selected = overdue ?? partialCurrent ?? current ?? future ?? paidCurrent ?? null;

  if (!selected) {
    return { label: "Aucun loyer actif", leaseId: activeLease.id, reason: "Aucun loyer exigible trouvé pour le bail actif." };
  }

  const dueSoon = selected.balance > 0 && selected.dueDate >= todayIso() && daysBetween(todayIso(), selected.dueDate) <= 7;
  const label = selected.balance === 0 ? "Payé" : selected.dueDate < todayIso() ? "En retard" : selected.status === "partiel" ? "Partiel" : dueSoon ? "Dû bientôt" : "À venir";

  return {
    amountAllocated: selected.amountAllocated,
    amountDue: selected.amountDue,
    balance: selected.balance,
    chargeId: selected.id,
    dueDate: selected.dueDate,
    formattedAmountAllocated: formatMoney(selected.amountAllocated),
    formattedAmountDue: formatMoney(selected.amountDue),
    formattedBalance: formatMoney(selected.balance),
    formattedDueDate: formatDate(selected.dueDate),
    lastPaymentAt: selected.lastPaymentAt || null,
    formattedLastPaymentAt: selected.lastPaymentAt ? formatDate(selected.lastPaymentAt) : null,
    label,
    leaseId: activeLease.id,
    periodMonth: selected.periodMonth,
    reason: getStatusReason(label, selected),
  };
}

function getStatusReason(label: string, row: RentChargeRow) {
  if (label === "Payé") {
    return row.lastPaymentAt ? `Solde payé. Dernier paiement reçu le ${row.lastPaymentAt}.` : "Solde payé.";
  }

  if (label === "Dû bientôt") {
    return "Le solde est impayé et l'échéance arrive dans les 7 prochains jours.";
  }

  if (label === "En retard") {
    return "Le solde est impayé et l'échéance est passée.";
  }

  if (label === "Partiel") {
    return "Un paiement partiel a été appliqué, mais un solde reste dû.";
  }

  return "Le solde est impayé et l'échéance est future.";
}

function summarizeChargeRows(rows: RentChargeRow[], store: LocalStore) {
  return rows.map((row) => ({
    amountAllocated: row.amountAllocated,
    amountDue: row.amountDue,
    balance: row.balance,
    dueDate: row.dueDate,
    formattedAmountAllocated: formatMoney(row.amountAllocated),
    formattedAmountDue: formatMoney(row.amountDue),
    formattedBalance: formatMoney(row.balance),
    formattedDueDate: formatDate(row.dueDate),
    formattedLastPaymentAt: row.lastPaymentAt ? formatDate(row.lastPaymentAt) : null,
    id: row.id,
    lastPaymentAt: row.lastPaymentAt || null,
    leaseId: row.leaseId,
    periodMonth: row.periodMonth,
    propertyName: summarizeNullableProperty(store, row.propertyId)?.name ?? null,
    propertyId: row.propertyId,
    status: row.status,
    tenantId: row.tenantId,
    tenantName: summarizeNullableTenant(store, row.tenantId)?.name ?? null,
    unitLabel: summarizeNullableUnit(store, row.unitId)?.label ?? null,
    unitId: row.unitId,
  }));
}

function summarizeLease(lease: Lease, store: LocalStore) {
  return {
    actualEndDate: lease.actualEndDate ?? null,
    endDate: lease.endDate,
    id: lease.id,
    monthlyRent: lease.monthlyRent,
    property: summarizeNullableProperty(store, lease.propertyId),
    startDate: lease.startDate,
    status: lease.status,
    tenant: summarizeNullableTenant(store, lease.tenantId),
    unit: summarizeNullableUnit(store, lease.unitId),
  };
}

function summarizeLeaseContext(store: LocalStore, lease: Lease) {
  return {
    endDate: lease.endDate,
    id: lease.id,
    property: summarizeNullableProperty(store, lease.propertyId),
    startDate: lease.startDate,
    status: lease.status,
    unit: summarizeNullableUnit(store, lease.unitId),
  };
}

function summarizeLeaseContextById(store: LocalStore, leaseId: string) {
  const lease = store.leases.find((candidate) => candidate.id === leaseId);
  return lease ? summarizeLeaseContext(store, lease) : null;
}

function summarizeProperty(property: Property) {
  return {
    address: formatPropertyAddress(property),
    id: property.id,
    name: property.name,
    type: property.propertyType,
  };
}

function summarizeNullableProperty(store: LocalStore, propertyId: string | null | undefined) {
  const property = propertyId ? findPropertyById(store, propertyId) : null;
  return property ? summarizeProperty(property) : null;
}

function summarizeUnit(unit: Unit) {
  return {
    floor: unit.floor,
    id: unit.id,
    label: unit.label,
    propertyId: unit.propertyId,
  };
}

function summarizeNullableUnit(store: LocalStore, unitId: string | null | undefined) {
  const unit = unitId ? findUnit(store, unitId) : null;
  return unit ? summarizeUnit(unit) : null;
}

function summarizeNullableTenant(store: LocalStore, tenantId: string | null | undefined) {
  const tenant = tenantId ? store.tenants.find((candidate) => candidate.id === tenantId) : null;
  return tenant ? { id: tenant.id, name: getTenantDisplayName(tenant) } : null;
}

function summarizeDocument(document: PropertyDocument) {
  return {
    hasFile: hasRealDocumentFile(document),
    id: document.id,
    name: document.name,
    type: document.type,
    uploadDate: document.uploadDate,
  };
}

function summarizeMaintenance(ticket: MaintenanceTicket) {
  return {
    createdAt: ticket.createdAt,
    id: ticket.id,
    priority: ticket.priority,
    status: ticket.status,
    title: ticket.title,
  };
}

function hasRealDocumentFile(document: PropertyDocument) {
  return Boolean(document.storagePath || document.fileDataUrl || document.mimeType || document.size);
}

function findActiveLeaseForTenant(store: LocalStore, tenantId: string) {
  return store.leases.find((lease) => lease.tenantId === tenantId && lease.status === "active") ?? null;
}

function findUnit(store: LocalStore, unitId: string) {
  return store.units.find((unit) => unit.id === unitId) ?? null;
}

function findPropertyById(store: LocalStore, propertyId: string) {
  return store.properties.find((property) => property.id === propertyId) ?? null;
}

function getTenantDisplayName(tenant: Tenant) {
  return tenant.fullName || `${tenant.firstName} ${tenant.lastName}`.trim() || "Locataire sans nom";
}

function formatPropertyAddress(property: Property) {
  return [property.addressLine1 || property.address, property.city, property.provinceCode || property.province, property.postalCode].filter(Boolean).join(", ");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`).getTime();
  const endDate = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.ceil((endDate - startDate) / 86_400_000);
}

function addDaysIso(date: string, days: number) {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function formatMoney(amount: number) {
  return currencyFormatter.format(amount).replace(/\u00a0/g, " ");
}

function formatDate(date: string) {
  if (!date) {
    return "";
  }

  const parsedDate = new Date(`${date}T12:00:00.000Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return dateFormatter.format(parsedDate).replace(/^1 /, "1er ");
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapProperty(row: Record<string, unknown>): Property {
  return {
    address: stringValue(row.address ?? row.address_line1),
    addressLine1: stringValue(row.address_line1 ?? row.address),
    addressProvider: nullableString(row.address_provider),
    addressProviderId: nullableString(row.address_provider_id),
    city: stringValue(row.city),
    country: stringValue(row.country || "Canada"),
    countryCode: stringValue(row.country_code || "CA"),
    district: optionalMapString(row.district),
    id: stringValue(row.id),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    name: stringValue(row.name || "Immeuble"),
    postalCode: stringValue(row.postal_code),
    propertyType: normalizePropertyType(row.property_type ?? row.type),
    province: stringValue(row.province || row.province_code || "Québec"),
    provinceCode: stringValue(row.province_code || row.province || "QC"),
    street: optionalMapString(row.street),
    streetNumber: optionalMapString(row.street_number),
  };
}

function mapUnit(row: Record<string, unknown>): Unit {
  return {
    floor: stringValue(row.floor),
    floorIndex: numberValue(row.floor_index),
    id: stringValue(row.id),
    label: stringValue(row.name ?? row.label ?? "Logement"),
    leaseEndDate: stringValue(row.lease_end_date),
    leaseStartDate: stringValue(row.lease_start_date),
    monthlyRent: numberValue(row.monthly_rent),
    notes: stringValue(row.notes),
    paymentStatus: normalizeLegacyPaymentStatus(row.payment_status),
    propertyId: stringValue(row.property_id),
    tenantId: nullableString(row.tenant_id),
  };
}

function mapTenant(row: Record<string, unknown>): Tenant {
  const fullName = stringValue(row.full_name);
  const [firstName, ...lastNameParts] = fullName.split(" ").filter(Boolean);

  return {
    archivedAt: nullableString(row.archived_at),
    createdAt: optionalMapString(row.created_at),
    email: stringValue(row.email),
    firstName: stringValue(row.first_name || firstName),
    fullName,
    id: stringValue(row.id),
    lastName: stringValue(row.last_name || lastNameParts.join(" ")),
    notes: stringValue(row.notes),
    phone: stringValue(row.phone),
    updatedAt: optionalMapString(row.updated_at),
  };
}

function mapLease(row: Record<string, unknown>): Lease {
  return {
    actualEndDate: nullableString(row.actual_end_date),
    createdAt: optionalMapString(row.created_at),
    endDate: stringValue(row.end_date),
    id: stringValue(row.id),
    monthlyRent: numberValue(row.monthly_rent),
    notes: stringValue(row.notes),
    paymentStatus: normalizeRentPaymentStatus(row.payment_status),
    propertyId: stringValue(row.property_id),
    startDate: stringValue(row.start_date),
    status: normalizeLeaseStatus(row.status),
    tenantId: stringValue(row.tenant_id),
    terminationNotes: nullableString(row.termination_notes),
    terminationReason: nullableString(row.termination_reason),
    unitId: stringValue(row.unit_id),
    updatedAt: optionalMapString(row.updated_at),
  };
}

function mapMaintenanceTicket(row: Record<string, unknown>): MaintenanceTicket {
  return {
    createdAt: stringValue(row.reported_at ?? row.created_at),
    description: stringValue(row.description),
    id: stringValue(row.id),
    priority: normalizeTicketPriority(row.priority),
    propertyId: stringValue(row.property_id),
    status: normalizeTicketStatus(row.status),
    title: stringValue(row.title),
    unitId: stringValue(row.unit_id),
  };
}

function mapActivity(row: Record<string, unknown>): UnitActivity {
  const createdAt = stringValue(row.created_at);

  return {
    createdAt,
    date: stringValue(row.date || createdAt.slice(0, 10)),
    description: stringValue(row.description),
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    propertyId: optionalMapString(row.property_id),
    tenantId: nullableString(row.tenant_id),
    title: stringValue(row.title),
    type: normalizeActivityType(row.activity_type ?? row.type),
    unitId: optionalMapString(row.unit_id),
  };
}

function mapDocument(row: Record<string, unknown>): PropertyDocument {
  const uploadedAt = stringValue(row.uploaded_at ?? row.created_at);

  return {
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    mimeType: optionalMapString(row.mime_type),
    name: stringValue(row.title || row.file_name || "Document"),
    notes: optionalMapString(row.notes),
    propertyId: stringValue(row.property_id),
    relatedEntityId: optionalMapString(row.related_entity_id),
    relatedEntityType: normalizeDocumentRelatedEntityType(row.related_entity_type),
    size: optionalNumber(row.size_bytes),
    storagePath: optionalMapString(row.storage_path),
    tenantId: nullableString(row.tenant_id),
    type: normalizeDocumentType(row.document_type),
    unitId: stringValue(row.unit_id),
    uploadDate: uploadedAt ? uploadedAt.slice(0, 10) : "",
    uploadedAt: uploadedAt || undefined,
  };
}

function mapPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    amountDue: numberValue(row.amount_due),
    amountPaid: numberValue(row.amount_paid ?? row.amount),
    dueDate: stringValue(row.due_date),
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    month: stringValue(row.month || stringValue(row.due_date).slice(0, 7)),
    notes: stringValue(row.notes),
    paidAt: stringValue(row.paid_date),
    paymentType: "loyer",
    propertyId: stringValue(row.property_id),
    status: normalizeRentPaymentStatus(row.status),
    tenantId: nullableString(row.tenant_id),
    unitId: stringValue(row.unit_id),
  };
}

function mapRentCharge(row: Record<string, unknown>): RentCharge {
  return {
    amountDue: numberValue(row.amount_due),
    createdAt: optionalMapString(row.created_at),
    dueDate: stringValue(row.due_date),
    id: stringValue(row.id),
    leaseId: stringValue(row.lease_id),
    periodMonth: stringValue(row.period_month),
    propertyId: stringValue(row.property_id),
    tenantId: nullableString(row.tenant_id),
    unitId: stringValue(row.unit_id),
    updatedAt: optionalMapString(row.updated_at),
  };
}

function mapPaymentTransaction(row: Record<string, unknown>): PaymentTransaction {
  return {
    amountReceived: numberValue(row.amount_received),
    createdAt: optionalMapString(row.created_at),
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    method: normalizePaymentMethod(row.method),
    notes: optionalMapString(row.notes),
    propertyId: stringValue(row.property_id),
    receivedAt: stringValue(row.received_at),
    reference: optionalMapString(row.reference),
    tenantId: nullableString(row.tenant_id),
    updatedAt: optionalMapString(row.updated_at),
  };
}

function mapPaymentAllocation(row: Record<string, unknown>): PaymentAllocation {
  return {
    amountAllocated: numberValue(row.amount_allocated),
    createdAt: optionalMapString(row.created_at),
    id: stringValue(row.id),
    rentChargeId: stringValue(row.rent_charge_id),
    transactionId: stringValue(row.transaction_id),
  };
}

function mapNote(row: Record<string, unknown>): AppNote {
  return {
    content: stringValue(row.content),
    createdAt: stringValue(row.created_at),
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    propertyId: stringValue(row.property_id),
    targetId: stringValue(row.target_id),
    targetType: normalizeNoteTargetType(row.target_type),
    tenantId: nullableString(row.tenant_id),
    unitId: optionalMapString(row.unit_id),
    updatedAt: stringValue(row.updated_at ?? row.created_at),
  };
}

function mapTask(row: Record<string, unknown>): AppTask {
  return {
    completed: Boolean(row.completed),
    completedAt: nullableString(row.completed_at),
    createdAt: stringValue(row.created_at),
    description: stringValue(row.description),
    dueDate: stringValue(row.due_date),
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    priority: normalizeTaskPriority(row.priority),
    propertyId: optionalMapString(row.property_id),
    tenantId: nullableString(row.tenant_id),
    title: stringValue(row.title),
    unitId: optionalMapString(row.unit_id),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function optionalMapString(value: unknown) {
  const nextValue = stringValue(value);
  return nextValue || undefined;
}

function nullableString(value: unknown) {
  const nextValue = stringValue(value);
  return nextValue || null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function nullableNumber(value: unknown) {
  const parsed = numberValue(value);
  return parsed || null;
}

function optionalNumber(value: unknown) {
  const parsed = numberValue(value);
  return parsed || undefined;
}

function normalizePropertyType(value: unknown): Property["propertyType"] {
  return value === "triplex" || value === "duplex" || value === "condo" || value === "quadruplex" || value === "immeuble" ? value : "immeuble";
}

function normalizeLegacyPaymentStatus(value: unknown): Unit["paymentStatus"] {
  return value === "paid" || value === "dueSoon" || value === "late" ? value : "dueSoon";
}

function normalizeRentPaymentStatus(value: unknown): RentPaymentStatus {
  return value === "payé" || value === "partiel" || value === "en retard" || value === "à venir" ? value : "à venir";
}

function normalizeLeaseStatus(value: unknown): Lease["status"] {
  return value === "active" || value === "ended" || value === "archived" ? value : "active";
}

function normalizeTicketPriority(value: unknown): TicketPriority {
  return value === "low" || value === "medium" || value === "high" || value === "urgent" ? value : "medium";
}

function normalizeTicketStatus(value: unknown): TicketStatus {
  return value === "open" || value === "inProgress" || value === "resolved" ? value : "open";
}

function normalizeActivityType(value: unknown): ActivityType {
  return value === "paiement" || value === "bail" || value === "entretien" || value === "document" || value === "locataire" || value === "immeuble" || value === "note" || value === "tache"
    ? value
    : "note";
}

function normalizeDocumentType(value: unknown): DocumentType {
  return value === "bail" || value === "avis" || value === "recu" || value === "facture" || value === "photo" || value === "inspection" || value === "assurance" || value === "paiement" || value === "autre"
    ? value
    : "autre";
}

function normalizeDocumentRelatedEntityType(value: unknown): DocumentRelatedEntityType | undefined {
  return value === "immeuble" || value === "logement" || value === "locataire" || value === "bail" || value === "entretien" || value === "paiement" ? value : undefined;
}

function normalizeNoteTargetType(value: unknown): AppNote["targetType"] {
  return value === "immeuble" || value === "logement" || value === "locataire" || value === "entretien" ? value : "immeuble";
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  return value === "faible" || value === "moyenne" || value === "élevée" ? value : "moyenne";
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  return value === "virement" || value === "interac" || value === "cheque" || value === "especes" || value === "carte" || value === "autre" ? value : "virement";
}

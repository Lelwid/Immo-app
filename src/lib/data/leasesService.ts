import { getDataMode, shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { validateLeaseDateRange } from "@/lib/data/leaseValidation";
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
  financial_tracking_start_date?: string | null;
  actual_end_date?: string | null;
  monthly_rent: number | string;
  payment_status: string | null;
  status: string | null;
  notes: string | null;
  termination_reason?: string | null;
  termination_notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LeaseInput = {
  propertyId: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  financialTrackingStartDate?: string | null;
  monthlyRent: number;
  paymentStatus?: RentPaymentStatus;
  status?: Lease["status"];
  notes?: string;
};

export type LeaseTerminationInput = {
  actualEndDate: string;
  terminationNotes?: string;
  terminationReason?: string;
};

const loadError = "Impossible de charger les baux.";
const createError = "Impossible de créer le bail.";
const updateError = "Impossible de modifier le bail.";
const deleteError = "Impossible de supprimer le bail.";
const activeLeaseError = "Ce logement possède déjà un bail actif.";
const baseSelectColumns = "id,property_id,unit_id,tenant_id,start_date,end_date,monthly_rent,payment_status,status,notes,created_at,updated_at";
const selectColumns =
  "id,property_id,unit_id,tenant_id,start_date,end_date,financial_tracking_start_date,actual_end_date,monthly_rent,payment_status,status,notes,termination_reason,termination_notes,created_at,updated_at";
const activeLeaseWriteSelectColumns =
  "id,property_id,unit_id,tenant_id,start_date,end_date,financial_tracking_start_date,monthly_rent,payment_status,status,notes,created_at,updated_at";

export async function getLeases(): Promise<Lease[]> {
  if (canUseSupabase()) {
    const queryContext: LeaseQueryContext = {
      filters: [],
      operation: "getLeases",
      order: "start_date desc",
      selectedColumns: selectColumns,
    };
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .order("start_date", { ascending: false });

    if (error) {
      await logSupabaseLeaseError(error, queryContext);

      if (isMissingOptionalLeaseColumnError(error)) {
        return getLeasesWithBaseColumns(queryContext);
      }

      throw createLeaseServiceError(loadError, error);
    }

    if (!data) {
      throw createLeaseServiceError(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return loadLocalStore().leases;
}

export async function getLeasesByProperty(propertyId: string): Promise<Lease[]> {
  if (canUseSupabase()) {
    const queryContext: LeaseQueryContext = {
      filters: [`property_id = ${propertyId}`],
      operation: "getLeasesByProperty",
      order: "start_date desc",
      selectedColumns: selectColumns,
    };
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("property_id", propertyId)
      .order("start_date", { ascending: false });

    if (error) {
      await logSupabaseLeaseError(error, queryContext);

      if (isMissingOptionalLeaseColumnError(error)) {
        return getLeasesByPropertyWithBaseColumns(propertyId, queryContext);
      }

      throw createLeaseServiceError(loadError, error);
    }

    if (!data) {
      throw createLeaseServiceError(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return loadLocalStore().leases.filter((lease) => lease.propertyId === propertyId);
}

export async function getActiveLeaseByUnit(unitId: string): Promise<Lease | null> {
  if (canUseSupabase()) {
    const queryContext: LeaseQueryContext = {
      filters: [`unit_id = ${unitId}`, "status = active"],
      operation: "getActiveLeaseByUnit",
      order: "none",
      selectedColumns: selectColumns,
    };
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("unit_id", unitId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      await logSupabaseLeaseError(error, queryContext);

      if (isMissingOptionalLeaseColumnError(error)) {
        return getActiveLeaseByUnitWithBaseColumns(unitId, queryContext);
      }

      throw createLeaseServiceError(loadError, error);
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
      .select(activeLeaseWriteSelectColumns)
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new Error(activeLeaseError);
      }

      throw createLeaseServiceError(createError, error);
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
      .select(activeLeaseWriteSelectColumns)
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new Error(activeLeaseError);
      }

      throw createLeaseServiceError(updateError, error);
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

export async function endLease(leaseId: string, input?: LeaseTerminationInput): Promise<Lease> {
  const termination = normalizeLeaseTerminationInput(input);

  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .update({
        status: "ended",
        actual_end_date: termination.actualEndDate,
        termination_reason: termination.terminationReason,
        termination_notes: termination.terminationNotes,
      })
      .eq("id", leaseId)
      .select(selectColumns)
      .single();

    if (error || !data) {
      if (error) {
        await logSupabaseLeaseError(error, {
          filters: [`id = ${leaseId}`],
          operation: "endLease",
          order: "none",
          selectedColumns: selectColumns,
        });
      }

      throw createLeaseServiceError(updateError, error);
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
    actualEndDate: termination.actualEndDate,
    terminationReason: termination.terminationReason,
    terminationNotes: termination.terminationNotes,
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

type LeaseQueryContext = {
  filters: string[];
  operation: string;
  order: string;
  selectedColumns: string;
};

type SupabaseErrorShape = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

async function getLeasesWithBaseColumns(originalContext: LeaseQueryContext) {
  console.warn("[supabase:leases] Colonnes de terminaison absentes. Lecture temporaire des baux avec les colonnes de base.", {
    table,
    operation: originalContext.operation,
    selectedColumns: baseSelectColumns,
    missingColumns: ["actual_end_date", "termination_reason", "termination_notes"],
  });

  const { data, error } = await supabase!
    .from(table)
    .select(baseSelectColumns)
    .order("start_date", { ascending: false });

  if (error) {
    await logSupabaseLeaseError(error, { ...originalContext, operation: `${originalContext.operation}:baseColumns`, selectedColumns: baseSelectColumns });
    throw createLeaseServiceError(loadError, error);
  }

  return (data ?? []).map(fromSupabaseRow);
}

async function getLeasesByPropertyWithBaseColumns(propertyId: string, originalContext: LeaseQueryContext) {
  console.warn("[supabase:leases] Colonnes de terminaison absentes. Lecture temporaire des baux de l'immeuble avec les colonnes de base.", {
    table,
    operation: originalContext.operation,
    selectedColumns: baseSelectColumns,
    missingColumns: ["actual_end_date", "termination_reason", "termination_notes"],
  });

  const { data, error } = await supabase!
    .from(table)
    .select(baseSelectColumns)
    .eq("property_id", propertyId)
    .order("start_date", { ascending: false });

  if (error) {
    await logSupabaseLeaseError(error, { ...originalContext, operation: `${originalContext.operation}:baseColumns`, selectedColumns: baseSelectColumns });
    throw createLeaseServiceError(loadError, error);
  }

  return (data ?? []).map(fromSupabaseRow);
}

async function getActiveLeaseByUnitWithBaseColumns(unitId: string, originalContext: LeaseQueryContext) {
  console.warn("[supabase:leases] Colonnes de terminaison absentes. Lecture temporaire du bail actif avec les colonnes de base.", {
    table,
    operation: originalContext.operation,
    selectedColumns: baseSelectColumns,
    missingColumns: ["actual_end_date", "termination_reason", "termination_notes"],
  });

  const { data, error } = await supabase!
    .from(table)
    .select(baseSelectColumns)
    .eq("unit_id", unitId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    await logSupabaseLeaseError(error, { ...originalContext, operation: `${originalContext.operation}:baseColumns`, selectedColumns: baseSelectColumns });
    throw createLeaseServiceError(loadError, error);
  }

  return data ? fromSupabaseRow(data) : null;
}

async function logSupabaseLeaseError(error: SupabaseErrorShape, context: LeaseQueryContext) {
  const authenticatedUserId = await getAuthenticatedUserIdForDebug();

  console.error("[supabase:leases] Requête Supabase échouée.", {
    authenticatedUserId,
    code: error.code,
    dataMode: getDataMode(),
    details: error.details,
    filters: context.filters,
    hint: error.hint,
    message: error.message,
    operation: context.operation,
    order: context.order,
    queriedTable: table,
    selectedColumns: context.selectedColumns,
  });
}

async function getAuthenticatedUserIdForDebug() {
  if (!supabase) {
    return null;
  }

  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function isMissingOptionalLeaseColumnError(error: SupabaseErrorShape) {
  const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  return (
    (error.code === "PGRST204" || error.code === "42703") &&
    (text.includes("actual_end_date") ||
      text.includes("termination_reason") ||
      text.includes("termination_notes") ||
      text.includes("financial_tracking_start_date"))
  );
}

function createLeaseServiceError(message: string, cause?: unknown) {
  const causeMessage = cause instanceof Error ? cause.message : typeof cause === "object" && cause !== null && "message" in cause ? String((cause as { message?: unknown }).message) : "";
  const error = new Error(process.env.NODE_ENV === "development" && causeMessage ? `${message} ${causeMessage}` : message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
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
    financialTrackingStartDate: row.financial_tracking_start_date === undefined ? row.start_date : row.financial_tracking_start_date,
    actualEndDate: row.actual_end_date ?? null,
    monthlyRent: Number(row.monthly_rent ?? 0),
    paymentStatus: normalizeRentPaymentStatus(row.payment_status),
    status: normalizeLeaseStatus(row.status),
    notes: row.notes ?? "",
    terminationReason: row.termination_reason ?? null,
    terminationNotes: row.termination_notes ?? null,
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
    financial_tracking_start_date: input.financialTrackingStartDate === undefined ? input.startDate : input.financialTrackingStartDate,
    monthly_rent: input.monthlyRent,
    payment_status: input.paymentStatus ?? "à venir",
    status: input.status ?? "active",
    notes: input.notes?.trim() || null,
  };
}

function normalizeLeaseInput(input: LeaseInput): Required<LeaseInput> {
  validateLeaseDateRange(input.startDate, input.endDate);
  const financialTrackingStartDate = input.financialTrackingStartDate === undefined ? input.startDate : input.financialTrackingStartDate;
  const status = input.status ?? "active";

  if (status === "active" && financialTrackingStartDate === null) {
    throw new Error("Un bail actif doit posséder une date de début du suivi financier.");
  }

  if (
    financialTrackingStartDate !== null &&
    (financialTrackingStartDate < input.startDate || financialTrackingStartDate > input.endDate)
  ) {
    throw new Error("La date de suivi financier doit être comprise dans les dates du bail.");
  }

  return {
    propertyId: input.propertyId,
    unitId: input.unitId,
    tenantId: input.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    financialTrackingStartDate,
    monthlyRent: Number(input.monthlyRent || 0),
    paymentStatus: input.paymentStatus ?? "à venir",
    status,
    notes: input.notes ?? "",
  };
}

function normalizeLeaseTerminationInput(input: LeaseTerminationInput | undefined): Required<LeaseTerminationInput> {
  return {
    actualEndDate: input?.actualEndDate || new Date().toISOString().slice(0, 10),
    terminationReason: input?.terminationReason?.trim() || "Fin normale du bail",
    terminationNotes: input?.terminationNotes?.trim() || "",
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

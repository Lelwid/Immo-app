import { shouldUseSupabase } from "@/lib/data/dataMode";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { MaintenanceTicket, TicketPriority, TicketStatus } from "@/lib/types";

const table = "maintenance_requests";

type SupabaseMaintenanceRow = {
  id: string;
  user_id: string;
  property_id: string;
  unit_id: string | null;
  tenant_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  reported_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceRequestInput = {
  id?: string;
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  title: string;
  description?: string;
  priority?: TicketPriority;
  status?: TicketStatus;
  createdAt?: string;
};

export type MaintenanceRequestUpdateInput = Partial<MaintenanceRequestInput>;

const loadError = "Impossible de charger les demandes d'entretien.";
const createError = "Impossible de créer la demande d'entretien.";
const updateError = "Impossible de modifier la demande d'entretien.";
const deleteError = "Impossible de supprimer la demande d'entretien.";

export async function getMaintenanceRequests(): Promise<MaintenanceTicket[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .order("reported_at", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTickets(loadLocalStore().maintenanceTickets);
}

export async function getMaintenanceRequestsForProperty(propertyId: string): Promise<MaintenanceTicket[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("property_id", propertyId)
      .order("reported_at", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTickets(loadLocalStore().maintenanceTickets.filter((ticket) => ticket.propertyId === propertyId));
}

export async function getMaintenanceRequestsForUnit(unitId: string): Promise<MaintenanceTicket[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("unit_id", unitId)
      .order("reported_at", { ascending: false });

    if (error || !data) {
      throw new Error(loadError);
    }

    return data.map(fromSupabaseRow);
  }

  return sortTickets(loadLocalStore().maintenanceTickets.filter((ticket) => ticket.unitId === unitId));
}

export async function createMaintenanceRequest(input: MaintenanceRequestInput): Promise<MaintenanceTicket> {
  const ticketInput = normalizeInput(input);

  if (canUseSupabase()) {
    const userId = await getCurrentUserId(createError);
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(ticketInput, userId))
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const ticket: MaintenanceTicket = {
    id: ticketInput.id || createLocalTicketId(),
    propertyId: ticketInput.propertyId,
    unitId: ticketInput.unitId,
    title: ticketInput.title,
    description: ticketInput.description,
    priority: ticketInput.priority,
    status: ticketInput.status,
    createdAt: ticketInput.createdAt,
  };

  saveLocalStore({
    ...store,
    maintenanceTickets: upsertLocalTicket(store.maintenanceTickets, ticket),
  });

  return ticket;
}

export async function updateMaintenanceRequest(
  ticketId: string,
  input: MaintenanceRequestUpdateInput,
): Promise<MaintenanceTicket> {
  if (canUseSupabase()) {
    const existing = await getMaintenanceRequestById(ticketId, updateError);
    const nextInput = normalizeInput({ ...existing, ...input, id: ticketId });
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabaseUpdate(nextInput))
      .eq("id", ticketId)
      .select(selectColumns)
      .single();

    if (error || !data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existing = store.maintenanceTickets.find((ticket) => ticket.id === ticketId);

  if (!existing) {
    throw new Error(updateError);
  }

  const nextTicket = normalizeTicket({ ...existing, ...input, id: ticketId });

  saveLocalStore({
    ...store,
    maintenanceTickets: store.maintenanceTickets.map((ticket) => (ticket.id === ticketId ? nextTicket : ticket)),
  });

  return nextTicket;
}

export async function deleteMaintenanceRequest(ticketId: string): Promise<void> {
  if (canUseSupabase()) {
    const { error } = await supabase!.from(table).delete().eq("id", ticketId);

    if (error) {
      throw new Error(deleteError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({
    ...store,
    maintenanceTickets: store.maintenanceTickets.filter((ticket) => ticket.id !== ticketId),
  });
}

const selectColumns =
  "id,user_id,property_id,unit_id,tenant_id,title,description,priority,status,reported_at,completed_at,created_at,updated_at";

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

async function getMaintenanceRequestById(ticketId: string, errorMessage: string): Promise<MaintenanceTicket> {
  const { data, error } = await supabase!.from(table).select(selectColumns).eq("id", ticketId).single();

  if (error || !data) {
    throw new Error(errorMessage);
  }

  return fromSupabaseRow(data);
}

function fromSupabaseRow(row: SupabaseMaintenanceRow): MaintenanceTicket {
  const reportedAt = row.reported_at ?? row.created_at;

  return {
    id: row.id,
    propertyId: row.property_id,
    unitId: row.unit_id ?? "",
    title: row.title,
    description: row.description ?? "",
    priority: normalizePriority(row.priority),
    status: normalizeStatus(row.status),
    createdAt: reportedAt.slice(0, 10),
  };
}

function toSupabaseInsert(input: Required<MaintenanceRequestInput>, userId: string) {
  return {
    ...(isUuid(input.id) ? { id: input.id } : {}),
    ...toSupabaseUpdate(input),
    user_id: userId,
  };
}

function toSupabaseUpdate(input: Required<MaintenanceRequestInput>) {
  return {
    property_id: input.propertyId,
    unit_id: input.unitId || null,
    tenant_id: input.tenantId || null,
    title: input.title,
    description: input.description?.trim() || null,
    priority: input.priority,
    status: input.status,
    reported_at: `${input.createdAt}T12:00:00.000Z`,
  };
}

function normalizeInput(input: MaintenanceRequestInput): Required<MaintenanceRequestInput> {
  return {
    id: input.id ?? "",
    propertyId: input.propertyId,
    unitId: input.unitId ?? "",
    tenantId: input.tenantId ?? null,
    title: input.title.trim(),
    description: input.description ?? "",
    priority: normalizePriority(input.priority),
    status: normalizeStatus(input.status),
    createdAt: input.createdAt || new Date().toISOString().slice(0, 10),
  };
}

function normalizeTicket(ticket: MaintenanceTicket): MaintenanceTicket {
  return {
    ...ticket,
    unitId: ticket.unitId ?? "",
    title: ticket.title.trim(),
    description: ticket.description ?? "",
    priority: normalizePriority(ticket.priority),
    status: normalizeStatus(ticket.status),
    createdAt: ticket.createdAt || new Date().toISOString().slice(0, 10),
  };
}

function normalizePriority(priority: string | null | undefined): TicketPriority {
  if (priority === "low" || priority === "medium" || priority === "high" || priority === "urgent") {
    return priority;
  }

  return "medium";
}

function normalizeStatus(status: string | null | undefined): TicketStatus {
  if (status === "open" || status === "inProgress" || status === "resolved") {
    return status;
  }

  return "open";
}

function sortTickets(tickets: MaintenanceTicket[]) {
  return [...tickets].map(normalizeTicket).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function upsertLocalTicket(tickets: MaintenanceTicket[], ticket: MaintenanceTicket) {
  return tickets.some((candidate) => candidate.id === ticket.id)
    ? tickets.map((candidate) => (candidate.id === ticket.id ? ticket : candidate))
    : [...tickets, ticket];
}

function createLocalTicketId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `ticket-${crypto.randomUUID()}`;
  }

  return `ticket-${Date.now()}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

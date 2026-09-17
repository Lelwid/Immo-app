"use client";

import { buildRentLedger, type RentLedger } from "@/lib/data/rentLedgerService";
import { shouldUseSupabase } from "@/lib/data/dataMode";
import { validateMaintenanceImages } from "@/lib/fileValidation";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type {
  Lease,
  LocalStore,
  MaintenanceAttachment,
  MaintenanceTicket,
  PaymentAllocation,
  PaymentMethod,
  PaymentTransaction,
  Property,
  PropertyDocument,
  RentCharge,
  Tenant,
  TicketPriority,
  TicketStatus,
  Unit,
} from "@/lib/types";

export type TenantPortalAccount = {
  id: string;
  ownerUserId: string;
  status: "active" | "disabled";
  tenantId: string;
  userId: string;
};

export type TenantPortalInvitation = {
  acceptedAt?: string | null;
  email: string;
  expiresAt: string;
  id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  tenantId: string;
  token: string;
};

export type TenantPortalSnapshot = {
  accounts: TenantPortalAccount[];
  activeLease: Lease | null;
  activeTenant: Tenant | null;
  documents: PropertyDocument[];
  ledger: RentLedger;
  maintenanceAttachments: MaintenanceAttachment[];
  maintenanceRequests: MaintenanceTicket[];
  paymentAllocations: PaymentAllocation[];
  paymentTransactions: PaymentTransaction[];
  properties: Property[];
  rentCharges: RentCharge[];
  tenants: Tenant[];
  units: Unit[];
};

export type TenantMaintenanceInput = {
  category: TenantMaintenanceCategory;
  description: string;
  title: string;
};

export type TenantMaintenanceCategory = "plomberie" | "electricite" | "chauffage" | "electromenager" | "serrure" | "autre";

type TenantPortalStoreInput = Partial<Omit<LocalStore, "maintenanceTickets">> & {
  maintenanceRequests?: MaintenanceTicket[];
  maintenanceTickets?: MaintenanceTicket[];
};

const emptyPortalSnapshot: TenantPortalSnapshot = {
  accounts: [],
  activeLease: null,
  activeTenant: null,
  documents: [],
  ledger: buildRentLedger(createStore({})),
  maintenanceAttachments: [],
  maintenanceRequests: [],
  paymentAllocations: [],
  paymentTransactions: [],
  properties: [],
  rentCharges: [],
  tenants: [],
  units: [],
};

export async function getTenantPortalSnapshot(): Promise<TenantPortalSnapshot> {
  if (!canUseSupabase()) {
    return getLocalTenantPortalSnapshot();
  }

  const accounts = await getTenantPortalAccounts();

  if (accounts.length === 0) {
    return emptyPortalSnapshot;
  }

  const tenantIds = accounts.map((account) => account.tenantId);
  const [
    tenants,
    leases,
    rentCharges,
    paymentTransactions,
    documents,
    maintenanceRequests,
    maintenanceAttachments,
  ] = await Promise.all([
    selectRows("tenants", "id,user_id,full_name,email,phone,notes,archived_at,created_at,updated_at", (query) => query.in("id", tenantIds)).then((rows) => rows.map(mapTenant)),
    selectRows("leases", "id,property_id,unit_id,tenant_id,start_date,end_date,actual_end_date,monthly_rent,payment_status,status,notes,termination_reason,termination_notes,created_at,updated_at", (query) => query.in("tenant_id", tenantIds)).then((rows) => rows.map(mapLease)),
    selectRows("rent_charges", "id,property_id,unit_id,lease_id,tenant_id,period_month,due_date,amount_due,created_at,updated_at", (query) => query.in("tenant_id", tenantIds)).then((rows) => rows.map(mapRentCharge)),
    selectRows("payment_transactions", "id,property_id,lease_id,tenant_id,received_at,amount_received,method,reference,notes,created_at,updated_at", (query) => query.in("tenant_id", tenantIds)).then((rows) => rows.map(mapPaymentTransaction)),
    selectRows("documents", "id,user_id,property_id,unit_id,tenant_id,lease_id,title,document_type,file_name,file_url,storage_path,mime_type,size_bytes,related_entity_type,related_entity_id,notes,uploaded_at,created_at,updated_at,visibility").then((rows) => rows.map(mapDocument)),
    selectRows("maintenance_requests", "id,user_id,property_id,unit_id,tenant_id,title,description,priority,status,reported_at,completed_at,created_at,updated_at", (query) => query.in("tenant_id", tenantIds)).then((rows) => rows.map(mapMaintenanceTicket)),
    selectRows("maintenance_request_attachments", "id,maintenance_request_id,tenant_id,file_name,storage_path,mime_type,size_bytes,created_at").then((rows) => rows.map(mapMaintenanceAttachment)),
  ]);
  const propertyIds = Array.from(new Set(leases.map((lease) => lease.propertyId)));
  const unitIds = Array.from(new Set(leases.map((lease) => lease.unitId)));
  const chargeIds = rentCharges.map((charge) => charge.id);
  const [properties, units, paymentAllocations] = await Promise.all([
    propertyIds.length > 0
      ? selectRows("properties", "id,name,address,address_line1,street_number,street,city,district,province,province_code,postal_code,country,country_code,latitude,longitude,address_provider,address_provider_id,type,property_type", (query) => query.in("id", propertyIds)).then((rows) => rows.map(mapProperty))
      : Promise.resolve([]),
    unitIds.length > 0
      ? selectRows("units", "id,property_id,name,floor,floor_index,sort_order,monthly_rent,status,tenant_id,alerts_count,created_at,updated_at", (query) => query.in("id", unitIds)).then((rows) => rows.map(mapUnit))
      : Promise.resolve([]),
    chargeIds.length > 0
      ? selectRows("payment_allocations", "id,transaction_id,rent_charge_id,amount_allocated,created_at", (query) => query.in("rent_charge_id", chargeIds)).then((rows) => rows.map(mapPaymentAllocation))
      : Promise.resolve([]),
  ]);
  const store = createStore({
    documents,
    leases,
    maintenanceRequests,
    paymentAllocations,
    paymentTransactions,
    properties,
    rentCharges,
    tenants,
    units,
  });
  const activeLease = leases.find((lease) => lease.status === "active") ?? null;
  const activeTenant = activeLease ? tenants.find((tenant) => tenant.id === activeLease.tenantId) ?? tenants[0] ?? null : tenants[0] ?? null;

  return {
    accounts,
    activeLease,
    activeTenant,
    documents: sortDocuments(documents),
    ledger: buildRentLedger(store),
    maintenanceAttachments,
    maintenanceRequests: sortMaintenance(maintenanceRequests),
    paymentAllocations,
    paymentTransactions,
    properties,
    rentCharges,
    tenants,
    units,
  };
}

export async function hasActiveTenantPortalAccount() {
  if (!canUseSupabase()) {
    return false;
  }

  return (await getTenantPortalAccounts()).length > 0;
}

export async function createTenantMaintenanceRequest(input: TenantMaintenanceInput, files: File[] = []) {
  if (!canUseSupabase()) {
    return createLocalTenantMaintenanceRequest(input);
  }

  const snapshot = await getTenantPortalSnapshot();
  const lease = snapshot.activeLease;
  const tenant = snapshot.activeTenant;
  const account = tenant ? snapshot.accounts.find((candidate) => candidate.tenantId === tenant.id && candidate.status === "active") : null;

  if (!lease || !tenant || !account) {
    throw new Error("Aucun bail actif ne permet de créer une demande d'entretien.");
  }

  const { data, error } = await supabase!
    .from("maintenance_requests")
    .insert({
      description: `${categoryLabel[input.category]} — ${input.description.trim()}`,
      priority: "medium",
      property_id: lease.propertyId,
      reported_at: new Date().toISOString(),
      status: "open",
      tenant_id: tenant.id,
      title: input.title.trim(),
      unit_id: lease.unitId,
      user_id: account.ownerUserId,
    })
    .select("id,user_id,property_id,unit_id,tenant_id,title,description,priority,status,reported_at,completed_at,created_at,updated_at")
    .single();

  if (error || !data) {
    logClientError("Impossible de créer la demande locataire.", error);
    throw new Error("Impossible d'envoyer la demande d'entretien.");
  }

  const ticket = mapMaintenanceTicket(data);
  await uploadMaintenanceAttachments(account.ownerUserId, tenant.id, ticket.id, files);
  return ticket;
}

export async function createTenantPortalInvitation(tenant: Tenant, email: string) {
  if (!canUseSupabase()) {
    const invitation: TenantPortalInvitation = {
      email: email.trim().toLowerCase(),
      expiresAt: addDaysIso(new Date().toISOString().slice(0, 10), 14),
      id: `local-tenant-invitation-${tenant.id}`,
      status: "pending",
      tenantId: tenant.id,
      token: `local-${tenant.id}`,
    };
    return { activationUrl: `/locataire/invitation?token=${invitation.token}`, invitation };
  }

  const { data: userData, error: userError } = await supabase!.auth.getUser();

  if (userError || !userData.user?.id) {
    throw new Error("Session propriétaire invalide.");
  }

  const { data, error } = await supabase!
    .from("tenant_portal_invitations")
    .insert({
      email: email.trim().toLowerCase(),
      invited_by: userData.user.id,
      owner_user_id: userData.user.id,
      tenant_id: tenant.id,
    })
    .select("id,tenant_id,email,token,status,expires_at,accepted_at")
    .single();

  if (error || !data) {
    logClientError("Impossible de créer l'invitation au portail.", error);
    throw new Error("Impossible de créer l'invitation au portail.");
  }

  const invitation = mapInvitation(data);
  return { activationUrl: `/locataire/invitation?token=${invitation.token}`, invitation };
}

export async function getTenantPortalAccessForTenant(tenantId: string) {
  if (!canUseSupabase()) {
    return { accountStatus: "Non invité", invitation: null as TenantPortalInvitation | null };
  }

  const [accounts, invitations] = await Promise.all([
    selectRows("tenant_portal_accounts", "id,user_id,tenant_id,owner_user_id,status,invited_at,activated_at,disabled_at,created_at,updated_at", (query) => query.eq("tenant_id", tenantId)).then((rows) => rows.map(mapAccount)),
    selectRows("tenant_portal_invitations", "id,tenant_id,email,token,status,expires_at,accepted_at", (query) => query.eq("tenant_id", tenantId).order("created_at", { ascending: false })).then((rows) => rows.map(mapInvitation)),
  ]);
  const activeAccount = accounts.find((account) => account.status === "active");
  const pendingInvitation = invitations.find((invitation) => invitation.status === "pending");

  return {
    accountStatus: activeAccount ? "Actif" : pendingInvitation ? "Invitation envoyée" : "Non invité",
    invitation: pendingInvitation ?? invitations[0] ?? null,
  };
}

export async function disableTenantPortalAccess(tenantId: string) {
  if (!canUseSupabase()) {
    return;
  }

  const { error } = await supabase!
    .from("tenant_portal_accounts")
    .update({ status: "disabled" })
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error("Impossible de désactiver l'accès au portail.");
  }
}

export async function acceptTenantPortalInvitation(token: string) {
  if (!canUseSupabase()) {
    return;
  }

  const { error } = await supabase!.rpc("accept_tenant_portal_invitation", { invitation_token: token });

  if (error) {
    logClientError("Impossible d'accepter l'invitation.", error);
    throw new Error("Invitation invalide, expirée ou déjà utilisée.");
  }
}

export async function getMaintenanceAttachmentUrl(attachment: MaintenanceAttachment) {
  if (!canUseSupabase()) {
    return "";
  }

  const { data, error } = await supabase!.storage.from("maintenance-attachments").createSignedUrl(attachment.storagePath, 60 * 10);

  if (error || !data?.signedUrl) {
    throw new Error("Impossible d'ouvrir la pièce jointe.");
  }

  return data.signedUrl;
}

function getLocalTenantPortalSnapshot(): TenantPortalSnapshot {
  const store = loadLocalStore();
  const activeLease = store.leases.find((lease) => lease.status === "active") ?? null;
  const activeTenant = activeLease ? store.tenants.find((tenant) => tenant.id === activeLease.tenantId) ?? null : store.tenants[0] ?? null;

  if (!activeTenant) {
    return emptyPortalSnapshot;
  }

  const tenantLeases = store.leases.filter((lease) => lease.tenantId === activeTenant.id);
  const tenantLeaseIds = new Set(tenantLeases.map((lease) => lease.id));
  const tenantUnitIds = new Set(tenantLeases.map((lease) => lease.unitId));
  const tenantPropertyIds = new Set(tenantLeases.map((lease) => lease.propertyId));
  const rentCharges = store.rentCharges.filter((charge) => tenantLeaseIds.has(charge.leaseId) || charge.tenantId === activeTenant.id);
  const chargeIds = new Set(rentCharges.map((charge) => charge.id));
  const paymentTransactions = store.paymentTransactions.filter((transaction) => transaction.tenantId === activeTenant.id || Boolean(transaction.leaseId && tenantLeaseIds.has(transaction.leaseId)));
  const paymentAllocations = store.paymentAllocations.filter((allocation) => chargeIds.has(allocation.rentChargeId));
  const payments = store.payments.filter((payment) => payment.tenantId === activeTenant.id || tenantUnitIds.has(payment.unitId));
  const documents = store.documents.filter((document) => document.tenantId === activeTenant.id || tenantUnitIds.has(document.unitId) || Boolean(document.leaseId && tenantLeaseIds.has(document.leaseId)));
  const maintenanceRequests = store.maintenanceTickets.filter((ticket) => ticket.tenantId === activeTenant.id || tenantUnitIds.has(ticket.unitId));
  const portalStore = createStore({
    documents,
    leases: tenantLeases,
    maintenanceRequests,
    paymentAllocations,
    paymentTransactions,
    payments,
    properties: store.properties.filter((property) => tenantPropertyIds.has(property.id)),
    rentCharges,
    tenants: [activeTenant],
    units: store.units.filter((unit) => tenantUnitIds.has(unit.id)),
  });

  return {
    accounts: [],
    activeLease,
    activeTenant,
    documents,
    ledger: buildRentLedger(portalStore),
    maintenanceAttachments: [],
    maintenanceRequests: sortMaintenance(maintenanceRequests),
    paymentAllocations,
    paymentTransactions,
    properties: portalStore.properties,
    rentCharges,
    tenants: [activeTenant],
    units: portalStore.units,
  };
}

function createLocalTenantMaintenanceRequest(input: TenantMaintenanceInput) {
  const snapshot = getLocalTenantPortalSnapshot();
  const lease = snapshot.activeLease;
  const tenant = snapshot.activeTenant;

  if (!lease || !tenant) {
    throw new Error("Aucun bail actif ne permet de créer une demande d'entretien.");
  }

  const ticket: MaintenanceTicket = {
    createdAt: new Date().toISOString().slice(0, 10),
    description: `${categoryLabel[input.category]} — ${input.description.trim()}`,
    id: `tenant-ticket-${crypto.randomUUID()}`,
    priority: "medium",
    propertyId: lease.propertyId,
    status: "open",
    tenantId: tenant.id,
    title: input.title.trim(),
    unitId: lease.unitId,
  };
  const store = loadLocalStore();
  saveLocalStore({ ...store, maintenanceTickets: [ticket, ...store.maintenanceTickets] });
  return ticket;
}

async function getTenantPortalAccounts() {
  const { data, error } = await supabase!.auth.getUser();

  if (error || !data.user?.id) {
    throw new Error("Session locataire invalide.");
  }

  const rows = await selectRows("tenant_portal_accounts", "id,user_id,tenant_id,owner_user_id,status,invited_at,activated_at,disabled_at,created_at,updated_at", (query) =>
    query.eq("user_id", data.user.id).eq("status", "active"),
  );

  return rows.map(mapAccount);
}

async function uploadMaintenanceAttachments(ownerUserId: string, tenantId: string, requestId: string, files: File[]) {
  if (files.length === 0) {
    return;
  }

  const validationError = validateMaintenanceImages(files);

  if (validationError) {
    throw new Error(validationError);
  }

  await Promise.all(
    files.map(async (file) => {
      const storagePath = `${ownerUserId}/${tenantId}/${requestId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      const { error: uploadError } = await supabase!.storage.from("maintenance-attachments").upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
      });

      if (uploadError) {
        throw new Error("Impossible de téléverser une photo.");
      }

      const { error: insertError } = await supabase!.from("maintenance_request_attachments").insert({
        file_name: file.name,
        maintenance_request_id: requestId,
        mime_type: file.type || null,
        size_bytes: file.size,
        storage_path: storagePath,
        tenant_id: tenantId,
        user_id: ownerUserId,
      });

      if (insertError) {
        throw new Error("Impossible d'enregistrer une photo.");
      }
    }),
  );
}

function createStore(input: TenantPortalStoreInput): LocalStore {
  return {
    activities: [],
    documents: input.documents ?? [],
    leases: input.leases ?? [],
    maintenanceTickets: input.maintenanceTickets ?? input.maintenanceRequests ?? [],
    notes: [],
    paymentAllocations: input.paymentAllocations ?? [],
    paymentTransactions: input.paymentTransactions ?? [],
    payments: input.payments ?? [],
    properties: input.properties ?? [],
    rentCharges: input.rentCharges ?? [],
    tasks: [],
    tenants: input.tenants ?? [],
    units: input.units ?? [],
  };
}

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

function logClientError(message: string, error: unknown) {
  console.error(message, process.env.NODE_ENV === "production" ? undefined : error);
}

async function selectRows(
  table: string,
  columns: string,
  apply?: (query: SupabaseSelectQuery) => SupabaseSelectQuery,
) {
  const client = supabase as unknown as SupabaseQueryClient;
  const baseQuery = client.from(table).select(columns);
  const query = apply ? apply(baseQuery) : baseQuery;
  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossible de charger ${table}. ${error.message ?? ""}`.trim());
  }

  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

type SupabaseSelectQuery = {
  eq: (column: string, value: string) => SupabaseSelectQuery;
  in: (column: string, values: string[]) => SupabaseSelectQuery;
  order: (column: string, options: { ascending: boolean }) => SupabaseSelectQuery;
  then: PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>["then"];
};

type SupabaseQueryClient = {
  from: (table: string) => {
    select: (columns: string) => SupabaseSelectQuery;
  };
};

function mapAccount(row: Record<string, unknown>): TenantPortalAccount {
  return {
    id: stringValue(row.id),
    ownerUserId: stringValue(row.owner_user_id),
    status: row.status === "disabled" ? "disabled" : "active",
    tenantId: stringValue(row.tenant_id),
    userId: stringValue(row.user_id),
  };
}

function mapInvitation(row: Record<string, unknown>): TenantPortalInvitation {
  return {
    acceptedAt: nullableString(row.accepted_at),
    email: stringValue(row.email),
    expiresAt: stringValue(row.expires_at),
    id: stringValue(row.id),
    status: normalizeInvitationStatus(row.status),
    tenantId: stringValue(row.tenant_id),
    token: stringValue(row.token),
  };
}

function mapProperty(row: Record<string, unknown>): Property {
  return {
    address: stringValue(row.address ?? row.address_line1),
    addressLine1: optionalString(row.address_line1 ?? row.address),
    addressProvider: nullableString(row.address_provider),
    addressProviderId: nullableString(row.address_provider_id),
    city: stringValue(row.city),
    country: optionalString(row.country),
    countryCode: optionalString(row.country_code),
    district: optionalString(row.district),
    id: stringValue(row.id),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    name: stringValue(row.name || "Immeuble"),
    postalCode: stringValue(row.postal_code),
    propertyType: normalizePropertyType(row.property_type ?? row.type),
    province: stringValue(row.province || row.province_code || "Québec"),
    provinceCode: optionalString(row.province_code),
    street: optionalString(row.street),
    streetNumber: optionalString(row.street_number),
  };
}

function mapUnit(row: Record<string, unknown>): Unit {
  return {
    floor: stringValue(row.floor),
    floorIndex: numberValue(row.floor_index),
    id: stringValue(row.id),
    label: stringValue(row.name ?? row.label ?? "Logement"),
    leaseEndDate: "",
    leaseStartDate: "",
    monthlyRent: numberValue(row.monthly_rent),
    notes: "",
    paymentStatus: "dueSoon",
    propertyId: stringValue(row.property_id),
    tenantId: nullableString(row.tenant_id),
  };
}

function mapTenant(row: Record<string, unknown>): Tenant {
  const fullName = stringValue(row.full_name);
  const [firstName, ...lastNameParts] = fullName.split(" ").filter(Boolean);

  return {
    archivedAt: nullableString(row.archived_at),
    createdAt: optionalString(row.created_at),
    email: stringValue(row.email),
    firstName: firstName || fullName,
    fullName,
    id: stringValue(row.id),
    lastName: lastNameParts.join(" "),
    notes: "",
    phone: stringValue(row.phone),
    updatedAt: optionalString(row.updated_at),
  };
}

function mapLease(row: Record<string, unknown>): Lease {
  return {
    actualEndDate: nullableString(row.actual_end_date),
    createdAt: optionalString(row.created_at),
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
    updatedAt: optionalString(row.updated_at),
  };
}

function mapRentCharge(row: Record<string, unknown>): RentCharge {
  return {
    amountDue: numberValue(row.amount_due),
    createdAt: optionalString(row.created_at),
    dueDate: stringValue(row.due_date),
    id: stringValue(row.id),
    leaseId: stringValue(row.lease_id),
    periodMonth: stringValue(row.period_month),
    propertyId: stringValue(row.property_id),
    tenantId: nullableString(row.tenant_id),
    unitId: stringValue(row.unit_id),
    updatedAt: optionalString(row.updated_at),
  };
}

function mapPaymentTransaction(row: Record<string, unknown>): PaymentTransaction {
  return {
    amountReceived: numberValue(row.amount_received),
    createdAt: optionalString(row.created_at),
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    method: normalizePaymentMethod(row.method),
    notes: optionalString(row.notes),
    propertyId: stringValue(row.property_id),
    receivedAt: stringValue(row.received_at),
    reference: optionalString(row.reference),
    tenantId: nullableString(row.tenant_id),
    updatedAt: optionalString(row.updated_at),
  };
}

function mapPaymentAllocation(row: Record<string, unknown>): PaymentAllocation {
  return {
    amountAllocated: numberValue(row.amount_allocated),
    createdAt: optionalString(row.created_at),
    id: stringValue(row.id),
    rentChargeId: stringValue(row.rent_charge_id),
    transactionId: stringValue(row.transaction_id),
  };
}

function mapDocument(row: Record<string, unknown>): PropertyDocument {
  const uploadedAt = stringValue(row.uploaded_at ?? row.created_at);

  return {
    id: stringValue(row.id),
    leaseId: nullableString(row.lease_id),
    mimeType: optionalString(row.mime_type),
    name: stringValue(row.title || row.file_name || "Document"),
    notes: undefined,
    propertyId: stringValue(row.property_id),
    relatedEntityId: optionalString(row.related_entity_id),
    relatedEntityType: undefined,
    size: optionalNumber(row.size_bytes),
    storagePath: optionalString(row.storage_path),
    tenantId: nullableString(row.tenant_id),
    type: normalizeDocumentType(row.document_type),
    unitId: stringValue(row.unit_id),
    uploadDate: uploadedAt.slice(0, 10),
    uploadedAt,
    visibility: row.visibility === "tenant" ? "tenant" : "private",
  };
}

function mapMaintenanceTicket(row: Record<string, unknown>): MaintenanceTicket {
  const reportedAt = stringValue(row.reported_at ?? row.created_at);

  return {
    completedAt: nullableString(row.completed_at),
    createdAt: reportedAt.slice(0, 10),
    description: stringValue(row.description),
    id: stringValue(row.id),
    priority: normalizePriority(row.priority),
    propertyId: stringValue(row.property_id),
    status: normalizeStatus(row.status),
    tenantId: nullableString(row.tenant_id),
    title: stringValue(row.title),
    unitId: stringValue(row.unit_id),
  };
}

function mapMaintenanceAttachment(row: Record<string, unknown>): MaintenanceAttachment {
  return {
    createdAt: stringValue(row.created_at),
    fileName: stringValue(row.file_name),
    id: stringValue(row.id),
    maintenanceRequestId: stringValue(row.maintenance_request_id),
    mimeType: nullableString(row.mime_type),
    size: optionalNumber(row.size_bytes),
    storagePath: stringValue(row.storage_path),
    tenantId: nullableString(row.tenant_id),
  };
}

function sortDocuments(documents: PropertyDocument[]) {
  return [...documents].sort((a, b) => (b.uploadedAt ?? b.uploadDate).localeCompare(a.uploadedAt ?? a.uploadDate));
}

function sortMaintenance(tickets: MaintenanceTicket[]) {
  return [...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function optionalString(value: unknown) {
  const next = stringValue(value);
  return next || undefined;
}

function nullableString(value: unknown) {
  const next = stringValue(value);
  return next || null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  const next = numberValue(value);
  return next || null;
}

function optionalNumber(value: unknown) {
  const next = numberValue(value);
  return next || undefined;
}

function normalizePropertyType(value: unknown): Property["propertyType"] {
  return value === "triplex" || value === "duplex" || value === "condo" || value === "quadruplex" || value === "immeuble" ? value : "immeuble";
}

function normalizeRentPaymentStatus(value: unknown): Lease["paymentStatus"] {
  return value === "payé" || value === "partiel" || value === "en retard" || value === "à venir" ? value : "à venir";
}

function normalizeLeaseStatus(value: unknown): Lease["status"] {
  return value === "active" || value === "ended" || value === "archived" ? value : "active";
}

function normalizePriority(value: unknown): TicketPriority {
  return value === "low" || value === "medium" || value === "high" || value === "urgent" ? value : "medium";
}

function normalizeStatus(value: unknown): TicketStatus {
  return value === "open" || value === "inProgress" || value === "resolved" ? value : "open";
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  return value === "virement" || value === "interac" || value === "cheque" || value === "especes" || value === "carte" || value === "autre" ? value : "virement";
}

function normalizeDocumentType(value: unknown): PropertyDocument["type"] {
  return value === "bail" || value === "avis" || value === "recu" || value === "facture" || value === "photo" || value === "inspection" || value === "assurance" || value === "paiement" || value === "autre"
    ? value
    : "autre";
}

function normalizeInvitationStatus(value: unknown): TenantPortalInvitation["status"] {
  return value === "accepted" || value === "revoked" || value === "expired" ? value : "pending";
}

function addDaysIso(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160) || "photo";
}

const categoryLabel: Record<TenantMaintenanceCategory, string> = {
  autre: "Autre",
  chauffage: "Chauffage",
  electricite: "Électricité",
  electromenager: "Électroménager",
  plomberie: "Plomberie",
  serrure: "Serrure / porte",
};

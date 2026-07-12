import {
  currency,
  documentTypeLabel,
  getPropertyName,
  getTenantName,
  getUnitLabel,
  rentPaymentStatusLabel,
  ticketPriorityLabel,
  ticketStatusLabel,
} from "./mockData";
import { getUnitOccupancy } from "./data/leaseAdapters";
import type { LocalStore } from "./types";

export type GlobalSearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  context: string;
  href: string;
};

export function getGlobalSearchResults(store: LocalStore, query: string): GlobalSearchResult[] {
  const search = normalizeSearchText(query);

  if (!search) {
    return [];
  }

  const results: GlobalSearchResult[] = [];

  for (const property of store.properties) {
    pushIfMatch(results, search, {
      id: `property-${property.id}`,
      type: "Immeuble",
      title: property.name,
      subtitle: `${property.address}, ${property.city}`,
      context: property.propertyType,
      href: `/immeubles/${property.id}`,
    });
  }

  for (const unit of store.units) {
    const propertyName = getPropertyName(unit.propertyId, store);
    const occupancy = getUnitOccupancy(unit, store.leases, store.tenants);
    const tenantName = occupancy.tenantName;

    pushIfMatch(results, search, {
      id: `unit-${unit.id}`,
      type: "Logement",
      title: unit.label,
      subtitle: `${propertyName} · ${unit.floor}`,
      context: `${tenantName} · ${currency.format(occupancy.monthlyRent)}/mois`,
      href: `/dashboard?property=${unit.propertyId}&unit=${unit.id}&tab=resume`,
    });

    if (occupancy.isOccupied) {
      pushIfMatch(results, search, {
        id: `lease-${unit.id}`,
        type: "Bail",
        title: `Bail · ${unit.label}`,
        subtitle: `${propertyName} · ${tenantName}`,
        context: `${occupancy.leaseStartDate} au ${occupancy.leaseEndDate}`,
        href: `/dashboard?property=${unit.propertyId}&unit=${unit.id}&tab=bail`,
      });
    }
  }

  for (const tenant of store.tenants) {
    const unit = store.units.find((candidate) => getUnitOccupancy(candidate, store.leases, store.tenants).tenantId === tenant.id);

    pushIfMatch(results, search, {
      id: `tenant-${tenant.id}`,
      type: "Locataire",
      title: `${tenant.firstName} ${tenant.lastName}`,
      subtitle: unit ? `${getPropertyName(unit.propertyId, store)} · ${unit.label}` : "Aucun logement assigné",
      context: `${tenant.email} · ${tenant.phone}`,
      href: `/locataires?tenant=${tenant.id}`,
    });
  }

  for (const payment of store.payments) {
    pushIfMatch(results, search, {
      id: `payment-${payment.id}`,
      type: "Paiement",
      title: `${payment.month} · ${rentPaymentStatusLabel[payment.status]}`,
      subtitle: `${getPropertyName(payment.propertyId, store)} · ${getUnitLabel(payment.unitId, store)}`,
      context: `${getTenantName(payment.tenantId, store)} · ${currency.format(payment.amountPaid)} / ${currency.format(payment.amountDue)}`,
      href: `/dashboard?property=${payment.propertyId}&unit=${payment.unitId}&tab=paiements`,
    });
  }

  for (const ticket of store.maintenanceTickets) {
    pushIfMatch(results, search, {
      id: `ticket-${ticket.id}`,
      type: "Demande d'entretien",
      title: ticket.title,
      subtitle: `${getPropertyName(ticket.propertyId, store)} · ${getUnitLabel(ticket.unitId, store)}`,
      context: `${ticketPriorityLabel[ticket.priority]} · ${ticketStatusLabel[ticket.status]}`,
      href: "/entretien",
    });
  }

  for (const document of store.documents) {
    pushIfMatch(results, search, {
      id: `document-${document.id}`,
      type: "Document",
      title: document.name,
      subtitle: `${documentTypeLabel[document.type]} · ${getPropertyName(document.propertyId, store)}`,
      context: `${getUnitLabel(document.unitId, store)} · ${document.uploadDate}`,
      href: `/documents?document=${document.id}`,
    });
  }

  for (const note of store.notes) {
    pushIfMatch(results, search, {
      id: `note-${note.id}`,
      type: "Note",
      title: "Note",
      subtitle: getNoteSubtitle(note, store),
      context: `${note.content} · ${note.updatedAt.slice(0, 10)}`,
      href: getNoteHref(note),
    });
  }

  for (const task of store.tasks) {
    pushIfMatch(results, search, {
      id: `task-${task.id}`,
      type: "Tâche personnelle",
      title: task.title,
      subtitle: getTaskSubtitle(task, store),
      context: `${task.description} · ${task.priority} · ${task.dueDate}`,
      href: "/taches",
    });
  }

  for (const activity of store.activities) {
    pushIfMatch(results, search, {
      id: `activity-${activity.id}`,
      type: "Historique",
      title: activity.title,
      subtitle: activity.propertyId ? getPropertyName(activity.propertyId, store) : "Activité du portefeuille",
      context: `${activity.description} · ${activity.date}`,
      href: activity.unitId
        ? `/dashboard?property=${activity.propertyId ?? ""}&unit=${activity.unitId}&tab=historique`
        : "/dashboard",
    });
  }

  return results.slice(0, 30);
}

function getTaskSubtitle(task: LocalStore["tasks"][number], store: LocalStore) {
  const parts = [
    task.completed ? "Terminée" : "À faire",
    task.propertyId ? getPropertyName(task.propertyId, store) : null,
    task.unitId ? getUnitLabel(task.unitId, store) : null,
    task.tenantId ? getTenantName(task.tenantId, store) : null,
  ].filter(Boolean);

  return parts.join(" · ");
}

function getNoteSubtitle(note: LocalStore["notes"][number], store: LocalStore) {
  if (note.targetType === "immeuble") {
    return getPropertyName(note.propertyId, store);
  }

  if (note.targetType === "logement" && note.unitId) {
    return `${getPropertyName(note.propertyId, store)} · ${getUnitLabel(note.unitId, store)}`;
  }

  if (note.targetType === "locataire") {
    return `${getPropertyName(note.propertyId, store)} · ${getTenantName(note.tenantId ?? null, store)}`;
  }

  return `${getPropertyName(note.propertyId, store)} · Demande d'entretien`;
}

function getNoteHref(note: LocalStore["notes"][number]) {
  if (note.targetType === "immeuble") {
    return `/immeubles/${note.propertyId}`;
  }

  if (note.targetType === "logement" && note.unitId) {
    return `/dashboard?property=${note.propertyId}&unit=${note.unitId}&tab=notes`;
  }

  if (note.targetType === "locataire" && note.tenantId) {
    return `/locataires?tenant=${note.tenantId}`;
  }

  return "/entretien";
}

function pushIfMatch(results: GlobalSearchResult[], search: string, result: GlobalSearchResult) {
  const haystack = normalizeSearchText(`${result.type} ${result.title} ${result.subtitle} ${result.context}`);

  if (haystack.includes(search)) {
    results.push(result);
  }
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

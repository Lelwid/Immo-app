import { buildPropertyDashboard, seedStore } from "./local-storage";
import { getUnitOccupancy } from "./data/leaseAdapters";
import type {
  DocumentType,
  LocalStore,
  NotificationItem,
  PaymentStatus,
  RentPaymentStatus,
  TicketPriority,
  TicketStatus,
} from "./types";

export const mockStore = seedStore;

export const currency = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  paid: "Payé",
  dueSoon: "Dû bientôt",
  late: "En retard",
};

export const rentPaymentStatusLabel: Record<RentPaymentStatus, string> = {
  payé: "Payé",
  partiel: "Partiel",
  "en retard": "En retard",
  "à venir": "À venir",
};

export const renewalStatusLabel: Record<PaymentStatus, string> = {
  paid: "À jour",
  dueSoon: "À surveiller",
  late: "Action requise",
};

export const ticketPriorityLabel: Record<TicketPriority, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
  urgent: "Urgente",
};

export const ticketStatusLabel: Record<TicketStatus, string> = {
  open: "Ouverte",
  inProgress: "En cours",
  resolved: "Résolue",
};

export const documentTypeLabel: Record<DocumentType, string> = {
  bail: "Bail",
  facture: "Facture",
  photo: "Photo",
  inspection: "Inspection",
  assurance: "Assurance",
  paiement: "Paiement",
  autre: "Autre",
};

export function getPropertyDashboards(store: LocalStore = mockStore) {
  return store.properties.map((property) => buildPropertyDashboard(store, property.id));
}

export function getPortfolioSummary(store: LocalStore = mockStore) {
  const properties = getPropertyDashboards(store);
  const monthlyRent = properties.reduce((sum, property) => sum + property.monthlyRent, 0);
  const paymentSummary = getPaymentSummary(store);
  const openMaintenanceCount = properties.reduce((sum, property) => sum + property.openTicketCount, 0);
  const urgentIssueCount = store.maintenanceTickets.filter(
    (ticket) => ticket.status !== "resolved" && (ticket.priority === "urgent" || ticket.priority === "high"),
  ).length;
  const leasesExpiringSoon = store.leases.filter((lease) => lease.status === "active" && isLeaseWithinDays(lease.endDate, 90)).length;
  const healthScore =
    properties.length > 0
      ? Math.round(properties.reduce((sum, property) => sum + property.healthScore, 0) / properties.length)
      : 0;

  return {
    healthScore,
    monthlyRent,
    paymentSummary,
    openMaintenanceCount,
    urgentIssueCount,
    leasesExpiringSoon,
  };
}

export function getPayments(store: LocalStore = mockStore) {
  return store.payments
    .map((payment) => ({
      ...payment,
      propertyName: getPropertyName(payment.propertyId, store),
      unitLabel: getUnitLabel(payment.unitId, store),
      tenantName: getTenantName(payment.tenantId, store),
    }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.propertyName.localeCompare(b.propertyName));
}

export function getRecentActivities(store: LocalStore = mockStore, limit = 5) {
  return [...store.activities].sort(compareActivitiesByNewest).slice(0, limit);
}

export function getPropertyActivities(propertyId: string, store: LocalStore = mockStore, limit = 6) {
  return store.activities
    .filter(
      (activity) =>
        activity.propertyId === propertyId ||
        (activity.unitId ? store.units.find((unit) => unit.id === activity.unitId)?.propertyId === propertyId : false),
    )
    .sort(compareActivitiesByNewest)
    .slice(0, limit);
}

export function getPaymentSummary(store: LocalStore = mockStore) {
  const currentMonth = getCurrentPaymentMonth(store);
  const monthlyPayments = store.payments.filter((payment) => payment.month === currentMonth);
  const expected = monthlyPayments.reduce((sum, payment) => sum + payment.amountDue, 0);
  const received = monthlyPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const late = monthlyPayments
    .filter((payment) => payment.status === "en retard")
    .reduce((sum, payment) => sum + payment.amountDue - payment.amountPaid, 0);

  return {
    currentMonth,
    expected,
    received,
    late,
    balanceDue: Math.max(0, expected - received),
  };
}

export function getTenantName(tenantId: string | null, store: LocalStore = mockStore) {
  const tenant = store.tenants.find((candidate) => candidate.id === tenantId);
  return tenant ? `${tenant.firstName} ${tenant.lastName}` : "Vacant";
}

export function getPropertyName(propertyId: string, store: LocalStore = mockStore) {
  return store.properties.find((property) => property.id === propertyId)?.name ?? "Immeuble";
}

export function getUnitLabel(unitId: string, store: LocalStore = mockStore) {
  return store.units.find((unit) => unit.id === unitId)?.label ?? "Logement";
}

export function getNotificationItems(store: LocalStore = mockStore): NotificationItem[] {
  const notifications: NotificationItem[] = [];
  const now = new Date();
  const leaseWarningDays = 90;

  for (const payment of store.payments.filter((candidate) => candidate.status === "en retard")) {
    const daysLate = getDaysSince(payment.dueDate, now);

    notifications.push({
      id: `payment-late-${payment.id}`,
      priority: "urgent",
      title: "Paiement en retard",
      property: getPropertyName(payment.propertyId, store),
      unit: getUnitLabel(payment.unitId, store),
      tenant: getTenantName(payment.tenantId, store),
      recommendedAction: "Envoyer un rappel au locataire.",
      urgencyReason: `Le paiement est en retard depuis ${daysLate} jour${daysLate > 1 ? "s" : ""}.`,
      relatedDeadline: payment.dueDate,
      timing: formatNotificationTiming(payment.dueDate, now),
      sortDate: payment.dueDate,
      href: "/paiements",
    });
  }

  for (const payment of store.payments.filter((candidate) => candidate.status === "partiel")) {
    notifications.push({
      id: `payment-partial-${payment.id}`,
      priority: "attention",
      title: "Paiement partiel reçu",
      property: getPropertyName(payment.propertyId, store),
      unit: getUnitLabel(payment.unitId, store),
      tenant: getTenantName(payment.tenantId, store),
      recommendedAction: "Confirmer le solde restant avec le locataire.",
      urgencyReason: "Un solde demeure ouvert pour le mois courant.",
      relatedDeadline: payment.dueDate,
      timing: payment.paidAt ? formatNotificationTiming(payment.paidAt, now) : "Solde à suivre",
      sortDate: payment.paidAt || payment.dueDate,
      href: "/paiements",
    });
  }

  for (const unit of store.units) {
    const occupancy = getUnitOccupancy(unit, store.leases, store.tenants);

    if (!occupancy.isOccupied) {
      continue;
    }

    const property = store.properties.find((candidate) => candidate.id === unit.propertyId);
    const propertyName = property?.name ?? "Immeuble";
    const tenantName = occupancy.tenantName === "Locataire introuvable" ? null : occupancy.tenantName;
    const leaseEnd = new Date(`${occupancy.leaseEndDate}T12:00:00`);
    const daysUntilLeaseEnd = Math.ceil((leaseEnd.getTime() - now.getTime()) / 86_400_000);

    if (daysUntilLeaseEnd >= 0 && daysUntilLeaseEnd <= leaseWarningDays) {
      notifications.push({
        id: `lease-ending-${unit.id}`,
        priority: daysUntilLeaseEnd <= 30 ? "urgent" : "attention",
        title: "Bail à renouveler bientôt",
        property: propertyName,
        unit: unit.label,
        tenant: tenantName,
        recommendedAction: "Préparer l'avis de renouvellement.",
        urgencyReason: daysUntilLeaseEnd <= 30 ? "La date limite approche rapidement." : "La fenêtre de renouvellement doit être préparée.",
        relatedDeadline: occupancy.leaseEndDate,
        timing: daysUntilLeaseEnd === 0 ? "Échéance aujourd’hui" : `Dans ${daysUntilLeaseEnd} jours`,
        sortDate: leaseEnd.toISOString(),
        href: "/baux",
      });
    }

    const hasLeaseDocument = store.documents.some((document) => document.unitId === unit.id && document.type === "bail");

    if (occupancy.tenantId && !hasLeaseDocument) {
      notifications.push({
        id: `missing-lease-document-${unit.id}`,
        priority: "info",
        title: "Document de bail manquant",
        property: propertyName,
        unit: unit.label,
        tenant: tenantName,
        recommendedAction: "Téléverser une copie du bail signé.",
        urgencyReason: "Le dossier du logement est incomplet.",
        relatedDeadline: occupancy.leaseStartDate,
        timing: "Dossier incomplet",
        sortDate: occupancy.leaseStartDate,
        href: "/documents",
      });
    }
  }

  for (const ticket of store.maintenanceTickets.filter((candidate) => candidate.status !== "resolved")) {
    const unit = store.units.find((candidate) => candidate.id === ticket.unitId);
    const occupancy = unit ? getUnitOccupancy(unit, store.leases, store.tenants) : null;
    const urgentTicket = ticket.priority === "urgent" || ticket.priority === "high";

    notifications.push({
      id: `maintenance-${ticket.id}`,
      priority: urgentTicket ? "urgent" : "attention",
      title: urgentTicket ? "Demande d'entretien urgente" : "Demande d'entretien ouverte",
      property: getPropertyName(ticket.propertyId, store),
      unit: getUnitLabel(ticket.unitId, store),
      tenant: occupancy?.isOccupied ? occupancy.tenantName : null,
      recommendedAction: urgentTicket
        ? "Contacter un entrepreneur ou planifier une intervention."
        : "Planifier le prochain suivi d'entretien.",
      urgencyReason: urgentTicket
        ? "Cette demande est marquée comme prioritaire."
        : "La demande est ouverte et attend une action.",
      relatedDeadline: ticket.createdAt,
      timing: formatNotificationTiming(ticket.createdAt, now),
      sortDate: ticket.createdAt,
      href: "/entretien",
    });
  }

  const priorityRank = {
    urgent: 0,
    attention: 1,
    info: 2,
  };

  return notifications.sort((a, b) => {
    const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime();
  });
}

function getCurrentPaymentMonth(store: LocalStore) {
  return store.payments.map((payment) => payment.month).sort().at(-1) ?? new Date().toISOString().slice(0, 7);
}

function isLeaseWithinDays(date: string, days: number) {
  const now = new Date();
  const targetDate = new Date(`${date}T12:00:00`);
  const daysUntilDate = Math.ceil((targetDate.getTime() - now.getTime()) / 86_400_000);

  return daysUntilDate >= 0 && daysUntilDate <= days;
}

function compareActivitiesByNewest(a: { createdAt?: string; date: string }, b: { createdAt?: string; date: string }) {
  return (b.createdAt ?? `${b.date}T12:00:00`).localeCompare(a.createdAt ?? `${a.date}T12:00:00`);
}

function formatNotificationTiming(date: string, now: Date) {
  const createdAt = new Date(`${date}T12:00:00`);
  const daysAgo = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));

  if (daysAgo === 0) {
    return "Aujourd’hui";
  }

  if (daysAgo === 1) {
    return "Hier";
  }

  return `Il y a ${daysAgo} jours`;
}

function getDaysSince(date: string, now: Date) {
  const referenceDate = new Date(`${date}T12:00:00`);
  return Math.max(0, Math.floor((now.getTime() - referenceDate.getTime()) / 86_400_000));
}

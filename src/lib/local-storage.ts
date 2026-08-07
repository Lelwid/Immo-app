import type {
  ActivityType,
  AppTask,
  Health,
  Lease,
  LocalStore,
  MaintenanceTicket,
  AppNote,
  PaymentAllocation,
  PaymentTransaction,
  PaymentRecord,
  PaymentStatus,
  Property,
  PropertyDashboard,
  RentCharge,
  Tenant,
  TicketPriority,
  Unit,
  UnitActivity,
  UnitDashboard,
} from "./types";
import { applyOccupationToLegacyUnit, getUnitOccupancy } from "./data/leaseAdapters";
import { computeRentChargeStatus, getPortfolioPaymentStatusFromCharges, isRentChargeActionRequired } from "./data/rentStatus";

export const STORAGE_KEY = "gestionnaire-immo-store-v1";

export const seedStore: LocalStore = {
  properties: [
    {
      id: "property-triplex-saint-sauveur",
      name: "Triplex Saint-Sauveur",
      address: "245 rue Saint-Vallier Ouest",
      city: "Québec",
      province: "QC",
      postalCode: "G1K 1K3",
      propertyType: "triplex",
    },
    {
      id: "property-duplex-limoilou",
      name: "Duplex Limoilou",
      address: "812 3e Avenue",
      city: "Québec",
      province: "QC",
      postalCode: "G1L 2W7",
      propertyType: "duplex",
    },
  ],
  tenants: [
    {
      id: "tenant-camille-tremblay",
      firstName: "Camille",
      lastName: "Tremblay",
      email: "camille.tremblay@example.com",
      phone: "418-555-0142",
    },
    {
      id: "tenant-noah-gagnon",
      firstName: "Noah",
      lastName: "Gagnon",
      email: "noah.gagnon@example.com",
      phone: "418-555-0198",
    },
    {
      id: "tenant-sophie-bouchard",
      firstName: "Sophie",
      lastName: "Bouchard",
      email: "sophie.bouchard@example.com",
      phone: "418-555-0117",
    },
    {
      id: "tenant-lea-roy",
      firstName: "Léa",
      lastName: "Roy",
      email: "lea.roy@example.com",
      phone: "418-555-0164",
    },
    {
      id: "tenant-olivier-fortin",
      firstName: "Olivier",
      lastName: "Fortin",
      email: "olivier.fortin@example.com",
      phone: "418-555-0182",
    },
  ],
  units: [
    {
      id: "unit-saint-sauveur-3",
      propertyId: "property-triplex-saint-sauveur",
      label: "Logement 3",
      floor: "3e étage",
      floorIndex: 3,
      monthlyRent: 1525,
      leaseStartDate: "2026-07-01",
      leaseEndDate: "2027-06-30",
      tenantId: "tenant-camille-tremblay",
      paymentStatus: "paid",
      notes: "Locataire stable. La discussion de renouvellement peut commencer en avril.",
    },
    {
      id: "unit-saint-sauveur-2",
      propertyId: "property-triplex-saint-sauveur",
      label: "Logement 2",
      floor: "2e étage",
      floorIndex: 2,
      monthlyRent: 1390,
      leaseStartDate: "2025-09-01",
      leaseEndDate: "2026-08-31",
      tenantId: "tenant-noah-gagnon",
      paymentStatus: "dueSoon",
      notes: "La fenêtre d'avis d'augmentation de loyer devrait être validée avant le renouvellement.",
    },
    {
      id: "unit-saint-sauveur-1",
      propertyId: "property-triplex-saint-sauveur",
      label: "Logement 1",
      floor: "Rez-de-chaussée",
      floorIndex: 1,
      monthlyRent: 1280,
      leaseStartDate: "2025-07-01",
      leaseEndDate: "2026-06-30",
      tenantId: "tenant-sophie-bouchard",
      paymentStatus: "late",
      notes: "Faire le suivi du plan de paiement et documenter toutes les communications en vue du TAL.",
    },
    {
      id: "unit-limoilou-2",
      propertyId: "property-duplex-limoilou",
      label: "Logement 2",
      floor: "2e étage",
      floorIndex: 2,
      monthlyRent: 1180,
      leaseStartDate: "2025-07-01",
      leaseEndDate: "2026-06-30",
      tenantId: "tenant-lea-roy",
      paymentStatus: "paid",
      notes: "Bail renouvelé. Aucun enjeu actif.",
    },
    {
      id: "unit-limoilou-1",
      propertyId: "property-duplex-limoilou",
      label: "Logement 1",
      floor: "Rez-de-chaussée",
      floorIndex: 1,
      monthlyRent: 1095,
      leaseStartDate: "2025-10-01",
      leaseEndDate: "2026-09-30",
      tenantId: "tenant-olivier-fortin",
      paymentStatus: "paid",
      notes: "Surveiller le balcon arrière au prochain entretien saisonnier.",
    },
  ],
  leases: [
    {
      id: "lease-unit-saint-sauveur-3-tenant-camille-tremblay",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-3",
      tenantId: "tenant-camille-tremblay",
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      monthlyRent: 1525,
      paymentStatus: "payé",
      status: "active",
      notes: "Locataire stable. La discussion de renouvellement peut commencer en avril.",
      createdAt: "2026-07-01T12:00:00.000Z",
      updatedAt: "2026-07-01T12:00:00.000Z",
    },
    {
      id: "lease-unit-saint-sauveur-2-tenant-noah-gagnon",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-2",
      tenantId: "tenant-noah-gagnon",
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      monthlyRent: 1390,
      paymentStatus: "partiel",
      status: "active",
      notes: "La fenêtre d'avis d'augmentation de loyer devrait être validée avant le renouvellement.",
      createdAt: "2025-09-01T12:00:00.000Z",
      updatedAt: "2025-09-01T12:00:00.000Z",
    },
    {
      id: "lease-unit-saint-sauveur-1-tenant-sophie-bouchard",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      tenantId: "tenant-sophie-bouchard",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      monthlyRent: 1280,
      paymentStatus: "en retard",
      status: "active",
      notes: "Faire le suivi du plan de paiement et documenter toutes les communications en vue du TAL.",
      createdAt: "2025-07-01T12:00:00.000Z",
      updatedAt: "2025-07-01T12:00:00.000Z",
    },
    {
      id: "lease-unit-limoilou-2-tenant-lea-roy",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-2",
      tenantId: "tenant-lea-roy",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      monthlyRent: 1180,
      paymentStatus: "payé",
      status: "active",
      notes: "Bail renouvelé. Aucun enjeu actif.",
      createdAt: "2025-07-01T12:00:00.000Z",
      updatedAt: "2025-07-01T12:00:00.000Z",
    },
    {
      id: "lease-unit-limoilou-1-tenant-olivier-fortin",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-1",
      tenantId: "tenant-olivier-fortin",
      startDate: "2025-10-01",
      endDate: "2026-09-30",
      monthlyRent: 1095,
      paymentStatus: "à venir",
      status: "active",
      notes: "Surveiller le balcon arrière au prochain entretien saisonnier.",
      createdAt: "2025-10-01T12:00:00.000Z",
      updatedAt: "2025-10-01T12:00:00.000Z",
    },
  ],
  maintenanceTickets: [
    {
      id: "ticket-faucet-saint-sauveur-2",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-2",
      title: "Robinet de cuisine qui coule",
      description: "Égouttement constant sous l'évier de cuisine.",
      status: "open",
      priority: "medium",
      createdAt: "2026-06-04",
    },
    {
      id: "ticket-heater-saint-sauveur-1",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      title: "Demande pour plinthe électrique",
      description: "Inspection demandée avant la prochaine période froide.",
      status: "open",
      priority: "high",
      createdAt: "2026-06-08",
    },
    {
      id: "ticket-fan-saint-sauveur-1",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      title: "Remplacement du ventilateur de salle de bain",
      description: "Ventilateur bruyant et faible extraction d'air.",
      status: "open",
      priority: "medium",
      createdAt: "2026-06-11",
    },
    {
      id: "ticket-balcony-limoilou-1",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-1",
      title: "Inspection du balcon arrière",
      description: "Vérifier les planches et les garde-corps.",
      status: "inProgress",
      priority: "low",
      createdAt: "2026-05-29",
    },
  ],
  activities: [
    {
      id: "activity-saint-sauveur-3-payment-june",
      unitId: "unit-saint-sauveur-3",
      date: "2026-06-01",
      type: "paiement",
      title: "Loyer re\u00e7u",
      description: "Loyer de juin reçu par virement Interac.",
    },
    {
      id: "activity-saint-sauveur-3-communication-renewal",
      unitId: "unit-saint-sauveur-3",
      date: "2026-06-06",
      type: "locataire",
      title: "Message de renouvellement",
      description: "Message envoyé au locataire au sujet du renouvellement éventuel.",
    },
    {
      id: "activity-saint-sauveur-3-inspection-smoke",
      unitId: "unit-saint-sauveur-3",
      date: "2026-06-12",
      type: "immeuble",
      title: "Inspection des avertisseurs",
      description: "Vérification des avertisseurs de fumée complétée.",
    },
    {
      id: "activity-saint-sauveur-2-lease-review",
      unitId: "unit-saint-sauveur-2",
      date: "2026-05-27",
      type: "bail",
      title: "Analyse du bail",
      description: "Analyse du bail avant la fenêtre d'avis de modification.",
    },
    {
      id: "activity-saint-sauveur-2-maintenance-faucet",
      unitId: "unit-saint-sauveur-2",
      date: "2026-06-04",
      type: "entretien",
      title: "Robinet signal\u00e9",
      description: "Demande ouverte pour un robinet de cuisine qui coule.",
    },
    {
      id: "activity-saint-sauveur-2-payment-due",
      unitId: "unit-saint-sauveur-2",
      date: "2026-06-13",
      type: "paiement",
      title: "Rappel de paiement",
      description: "Rappel de paiement planifié avant l'échéance du loyer.",
    },
    {
      id: "activity-saint-sauveur-1-communication-payment",
      unitId: "unit-saint-sauveur-1",
      date: "2026-06-03",
      type: "locataire",
      title: "Suivi de paiement",
      description: "Suivi envoyé au sujet du paiement en retard.",
    },
    {
      id: "activity-saint-sauveur-1-maintenance-heater",
      unitId: "unit-saint-sauveur-1",
      date: "2026-06-08",
      type: "entretien",
      title: "Plinthe \u00e9lectrique",
      description: "Demande ouverte pour l'entretien de la plinthe électrique.",
    },
    {
      id: "activity-saint-sauveur-1-maintenance-fan",
      unitId: "unit-saint-sauveur-1",
      date: "2026-06-11",
      type: "entretien",
      title: "Ventilateur \u00e0 remplacer",
      description: "Demande ouverte pour remplacer le ventilateur de salle de bain.",
    },
    {
      id: "activity-limoilou-2-payment-june",
      unitId: "unit-limoilou-2",
      date: "2026-06-01",
      type: "paiement",
      title: "Loyer re\u00e7u",
      description: "Loyer de juin reçu à temps.",
    },
    {
      id: "activity-limoilou-2-lease-renewed",
      unitId: "unit-limoilou-2",
      date: "2026-06-05",
      type: "bail",
      title: "Bail renouvel\u00e9",
      description: "Renouvellement de bail confirmé avec la locataire.",
    },
    {
      id: "activity-limoilou-2-communication-quiet",
      unitId: "unit-limoilou-2",
      date: "2026-06-10",
      type: "locataire",
      title: "Confirmation re\u00e7ue",
      description: "La locataire a confirm\u00e9 que tout est en ordre dans le logement.",
    },
    {
      id: "activity-limoilou-1-inspection-balcony",
      unitId: "unit-limoilou-1",
      date: "2026-05-29",
      type: "immeuble",
      title: "Balcon \u00e0 inspecter",
      description: "Inspection du balcon arrière planifiée.",
    },
    {
      id: "activity-limoilou-1-maintenance-balcony",
      unitId: "unit-limoilou-1",
      date: "2026-06-02",
      type: "entretien",
      title: "Suivi entrepreneur",
      description: "Suivi de l'inspection du balcon avec l'entrepreneur.",
    },
    {
      id: "activity-limoilou-1-payment-june",
      unitId: "unit-limoilou-1",
      date: "2026-06-03",
      type: "paiement",
      title: "Loyer concili\u00e9",
      description: "Loyer de juin reçu et concilié.",
    },
  ],
  documents: [
    {
      id: "document-bail-saint-sauveur-3",
      name: "Bail signe - Logement 3",
      type: "bail",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-3",
      uploadDate: "2026-06-01",
    },
    {
      id: "document-facture-robinet-saint-sauveur-2",
      name: "Facture plombier - Robinet cuisine",
      type: "facture",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-2",
      uploadDate: "2026-06-05",
    },
    {
      id: "document-photo-salle-bain-saint-sauveur-1",
      name: "Photo ventilateur salle de bain",
      type: "photo",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      uploadDate: "2026-06-11",
    },
    {
      id: "document-inspection-avertisseurs-saint-sauveur-3",
      name: "Rapport inspection avertisseurs",
      type: "inspection",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-3",
      uploadDate: "2026-06-12",
    },
    {
      id: "document-assurance-limoilou",
      name: "Police assurance immeuble",
      type: "assurance",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-2",
      uploadDate: "2026-05-30",
    },
    {
      id: "document-bail-limoilou-1",
      name: "Bail - Logement 1",
      type: "bail",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-1",
      uploadDate: "2025-10-01",
    },
  ],
  payments: [
    {
      id: "payment-saint-sauveur-3-2026-06",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-3",
      tenantId: "tenant-camille-tremblay",
      month: "2026-06",
      dueDate: "2026-06-01",
      amountDue: 1525,
      amountPaid: 1525,
      status: "payé",
      paidAt: "2026-06-01",
      notes: "Paiement reçu par virement Interac.",
    },
    {
      id: "payment-saint-sauveur-2-2026-06",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-2",
      tenantId: "tenant-noah-gagnon",
      month: "2026-06",
      dueDate: "2026-06-01",
      amountDue: 1390,
      amountPaid: 700,
      status: "partiel",
      paidAt: "2026-06-12",
      notes: "Paiement partiel reçu. Solde à suivre.",
    },
    {
      id: "payment-saint-sauveur-1-2026-06",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      tenantId: "tenant-sophie-bouchard",
      month: "2026-06",
      dueDate: "2026-06-01",
      amountDue: 1280,
      amountPaid: 0,
      status: "en retard",
      paidAt: "",
      notes: "Suivi requis avec la locataire.",
    },
    {
      id: "payment-limoilou-2-2026-06",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-2",
      tenantId: "tenant-lea-roy",
      month: "2026-06",
      dueDate: "2026-06-01",
      amountDue: 1180,
      amountPaid: 1180,
      status: "payé",
      paidAt: "2026-06-01",
      notes: "Paiement reçu à temps.",
    },
    {
      id: "payment-limoilou-1-2026-06",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-1",
      tenantId: "tenant-olivier-fortin",
      month: "2026-06",
      dueDate: "2026-06-25",
      amountDue: 1095,
      amountPaid: 0,
      status: "à venir",
      paidAt: "",
      notes: "Paiement prévu plus tard ce mois-ci.",
    },
  ],
  rentCharges: [],
  paymentTransactions: [],
  paymentAllocations: [],
  notes: [
    {
      id: "note-property-saint-sauveur-general",
      targetType: "immeuble",
      targetId: "property-triplex-saint-sauveur",
      propertyId: "property-triplex-saint-sauveur",
      content: "Prioriser les suivis de paiement et la préparation des renouvellements avant la fin du mois.",
      createdAt: "2026-06-12T10:00:00.000Z",
      updatedAt: "2026-06-12T10:00:00.000Z",
    },
    {
      id: "note-unit-saint-sauveur-1-payment",
      targetType: "logement",
      targetId: "unit-saint-sauveur-1",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      tenantId: "tenant-sophie-bouchard",
      content: "Documenter chaque échange lié au retard de paiement et conserver les preuves de communication.",
      createdAt: "2026-06-13T14:30:00.000Z",
      updatedAt: "2026-06-13T14:30:00.000Z",
    },
    {
      id: "note-tenant-noah-followup",
      targetType: "locataire",
      targetId: "tenant-noah-gagnon",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-2",
      tenantId: "tenant-noah-gagnon",
      content: "Confirmer le solde restant du paiement partiel avant le prochain cycle de loyer.",
      createdAt: "2026-06-14T09:15:00.000Z",
      updatedAt: "2026-06-14T09:15:00.000Z",
    },
  ],
  tasks: [
    {
      id: "task-rappel-sophie-paiement",
      title: "Envoyer un rappel de paiement",
      description: "Faire un suivi courtois avec Sophie Bouchard pour le loyer en retard.",
      completed: false,
      priority: "élevée",
      dueDate: "2026-06-24",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      tenantId: "tenant-sophie-bouchard",
      createdAt: "2026-06-20T09:00:00.000Z",
    },
    {
      id: "task-planifier-plinthe",
      title: "Planifier l’entretien de la plinthe",
      description: "Contacter un entrepreneur pour inspecter la plinthe électrique.",
      completed: false,
      priority: "élevée",
      dueDate: "2026-06-26",
      propertyId: "property-triplex-saint-sauveur",
      unitId: "unit-saint-sauveur-1",
      tenantId: "tenant-sophie-bouchard",
      createdAt: "2026-06-21T10:30:00.000Z",
    },
    {
      id: "task-classer-assurance-limoilou",
      title: "Vérifier le dossier d’assurance",
      description: "Confirmer que la police d’assurance de Limoilou est complète.",
      completed: true,
      priority: "moyenne",
      dueDate: "2026-06-18",
      propertyId: "property-duplex-limoilou",
      unitId: "unit-limoilou-2",
      tenantId: "tenant-lea-roy",
      createdAt: "2026-06-14T11:00:00.000Z",
    },
  ],
};

export function loadLocalStore(): LocalStore {
  if (typeof window === "undefined") {
    return cloneSeedStore();
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    const demoStore = cloneSeedStore();
    saveLocalStore(demoStore);
    return demoStore;
  }

  try {
    const parsedStore = JSON.parse(stored) as unknown;

    if (!isLocalStore(parsedStore)) {
      const demoStore = cloneSeedStore();
      saveLocalStore(demoStore);
      return demoStore;
    }

    const normalizedStore = normalizeStore(parsedStore);
    saveLocalStore(normalizedStore);
    return normalizedStore;
  } catch {
    const demoStore = cloneSeedStore();
    saveLocalStore(demoStore);
    return demoStore;
  }
}

export function saveLocalStore(store: LocalStore) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function resetLocalStore() {
  return resetDemoData();
}

export function resetDemoData() {
  const demoStore = cloneSeedStore();

  if (typeof window === "undefined") {
    return demoStore;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  saveLocalStore(demoStore);
  return demoStore;
}

export function buildPropertyDashboard(store: LocalStore, propertyId: string): PropertyDashboard {
  const property = store.properties.find((candidate) => candidate.id === propertyId) ?? store.properties[0];
  const units = store.units
    .filter((unit) => unit.propertyId === property.id)
    .sort((a, b) => b.floorIndex - a.floorIndex)
    .map((unit) =>
      buildUnitDashboard(
        unit,
        store.tenants,
        store.leases,
        store.maintenanceTickets,
        store.activities,
        store.payments,
        store.rentCharges,
        store.paymentAllocations,
      ),
    );

  const monthlyRent = units.reduce((sum, unit) => sum + unit.monthlyRent, 0);
  const openTicketCount = units.reduce((sum, unit) => sum + unit.openTickets.length, 0);
  const issueCount = units.filter((unit) => unit.health === "issue").length;

  return {
    ...property,
    units,
    monthlyRent,
    openTicketCount,
    issueCount,
    healthScore: calculatePropertyHealthScore(units),
  };
}

function buildUnitDashboard(
  unit: Unit,
  tenants: Tenant[],
  leases: Lease[],
  tickets: MaintenanceTicket[],
  activities: UnitActivity[],
  payments: PaymentRecord[],
  rentCharges: RentCharge[],
  paymentAllocations: PaymentAllocation[],
): UnitDashboard {
  const occupancy = getUnitOccupancy(unit, leases, tenants);
  const displayUnit = applyOccupationToLegacyUnit(unit, occupancy);
  const tenant = occupancy.tenantId ? tenants.find((candidate) => candidate.id === occupancy.tenantId && !candidate.archivedAt) ?? null : null;
  const openTickets = tickets.filter(
    (ticket) => ticket.unitId === unit.id && ticket.status !== "resolved",
  );
  const activityHistory = activities
    .filter((activity) => activity.unitId === unit.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const paymentHistory = payments
    .filter((payment) => payment.unitId === unit.id)
    .sort((a, b) => b.month.localeCompare(a.month));
  const paymentStatus = getUnitPaymentStatusFromLedger(displayUnit.paymentStatus, unit.id, paymentHistory, rentCharges, paymentAllocations);

  return {
    ...displayUnit,
    paymentStatus,
    tenant,
    openTickets,
    activities: activityHistory,
    payments: paymentHistory,
    health: calculateUnitHealth(paymentStatus, openTickets),
  };
}

function getUnitPaymentStatusFromLedger(
  fallback: PaymentStatus,
  unitId: string,
  payments: PaymentRecord[],
  rentCharges: RentCharge[],
  paymentAllocations: PaymentAllocation[],
): PaymentStatus {
  const today = getTodayForRentStatus();
  const unitCharges = rentCharges.filter((charge) => charge.unitId === unitId);

  if (unitCharges.length > 0) {
    return getPortfolioPaymentStatusFromCharges(unitCharges, paymentAllocations, today);
  }

  return getUnitPaymentStatusFromPayments(fallback, payments, today);
}

function getUnitPaymentStatusFromPayments(fallback: PaymentStatus, payments: PaymentRecord[], today: string): PaymentStatus {
  if (payments.length === 0) {
    return fallback;
  }

  const states = payments.map((payment) => ({
    amountAllocated: payment.amountPaid,
    amountDue: payment.amountDue,
    dueDate: payment.dueDate,
    status: computeRentChargeStatus({
      amountAllocated: payment.amountPaid,
      amountDue: payment.amountDue,
      dueDate: payment.dueDate,
      today,
    }),
  }));

  if (states.some((payment) => payment.status === "en retard")) {
    return "late";
  }

  if (
    states.some((payment) =>
      isRentChargeActionRequired({
        amountAllocated: payment.amountAllocated,
        amountDue: payment.amountDue,
        dueDate: payment.dueDate,
        today,
      }),
    )
  ) {
    return "dueSoon";
  }

  return "paid";
}

function getTodayForRentStatus() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

function calculateUnitHealth(paymentStatus: PaymentStatus, tickets: MaintenanceTicket[]): Health {
  const hasUrgentTicket = tickets.some((ticket) => ticket.priority === "urgent" || ticket.priority === "high");

  if (paymentStatus === "late" || hasUrgentTicket || tickets.length >= 2) {
    return "issue";
  }

  if (paymentStatus === "dueSoon" || tickets.length > 0) {
    return "attention";
  }

  return "ok";
}

function calculatePropertyHealthScore(units: UnitDashboard[]) {
  if (units.length === 0) {
    return 0;
  }

  const penalties = units.reduce((sum, unit) => {
    const paymentPenalty = getPaymentPenalty(unit.paymentStatus);
    const ticketPenalty = unit.openTickets.reduce(
      (ticketSum, ticket) => ticketSum + getTicketPenalty(ticket.priority),
      0,
    );

    return sum + paymentPenalty + ticketPenalty;
  }, 0);

  return Math.max(0, Math.min(100, Math.round(100 - penalties)));
}

function getPaymentPenalty(status: PaymentStatus) {
  if (status === "late") {
    return 12;
  }

  if (status === "dueSoon") {
    return 4;
  }

  return 0;
}

function getTicketPenalty(priority: TicketPriority) {
  const penalties: Record<TicketPriority, number> = {
    low: 2,
    medium: 4,
    high: 8,
    urgent: 12,
  };

  return penalties[priority];
}

function cloneSeedStore(): LocalStore {
  return JSON.parse(JSON.stringify(seedStore)) as LocalStore;
}

function normalizeStore(store: LocalStore): LocalStore {
  const baseUnits = ensurePropertyUnits(store);
  const units = baseUnits;
  const leases = normalizeLeaseIntegrity(normalizeLeases(store, units), units, store.tenants, store.properties);
  const normalizedActivities = store.activities.map((activity) => {
    const type = normalizeActivityType(activity.type);
    const activityUnit = activity.unitId ? units.find((unit) => unit.id === activity.unitId) : null;

    return {
      ...activity,
      propertyId: activity.propertyId || activityUnit?.propertyId || store.properties[0]?.id || "",
      tenantId: activity.tenantId ?? activityUnit?.tenantId ?? null,
      type,
      title: activity.title || getDefaultActivityTitle(type),
      createdAt: activity.createdAt || `${activity.date}T12:00:00.000Z`,
    };
  });
  const existingActivityIds = new Set(normalizedActivities.map((activity) => activity.id));
  const documents = (Array.isArray(store.documents) ? store.documents : seedStore.documents).map((document) => ({
    ...document,
    relatedEntityType: document.relatedEntityType ?? "logement",
    relatedEntityId: document.relatedEntityId ?? document.unitId,
    uploadedAt: document.uploadedAt ?? `${document.uploadDate}T12:00:00.000Z`,
  }));
  const payments = normalizePayments(Array.isArray(store.payments) ? store.payments : seedStore.payments, leases);
  const rentCharges = normalizeRentCharges((store as Partial<LocalStore>).rentCharges, leases, payments);
  const paymentTransactions = normalizePaymentTransactions((store as Partial<LocalStore>).paymentTransactions);
  const paymentAllocations = normalizePaymentAllocations((store as Partial<LocalStore>).paymentAllocations);
  const notes = normalizeNotes(store, units);
  const tasks = normalizeTasks(store);

  return {
    ...store,
    units,
    leases,
    activities: [
      ...normalizedActivities,
      ...seedStore.activities.filter((activity) => !existingActivityIds.has(activity.id)),
    ],
    documents,
    payments,
    rentCharges,
    paymentTransactions,
    paymentAllocations,
    notes,
    tasks,
  };
}

function normalizeRentCharges(
  rentCharges: RentCharge[] | undefined,
  leases: Lease[],
  payments: PaymentRecord[],
): RentCharge[] {
  const chargesById = new Map<string, RentCharge>();

  (Array.isArray(rentCharges) ? rentCharges : seedStore.rentCharges).forEach((charge) => {
    chargesById.set(charge.id, {
      ...charge,
      tenantId: charge.tenantId ?? leases.find((lease) => lease.id === charge.leaseId)?.tenantId ?? null,
      amountDue: Number(charge.amountDue || 0),
      createdAt: charge.createdAt || `${charge.dueDate}T12:00:00.000Z`,
      updatedAt: charge.updatedAt || charge.createdAt || `${charge.dueDate}T12:00:00.000Z`,
    });
  });

  payments.forEach((payment) => {
    if (!payment.leaseId) {
      return;
    }

    const chargeId = createRentChargeId(payment.leaseId, payment.month);

    if (!chargesById.has(chargeId)) {
      chargesById.set(chargeId, {
        id: chargeId,
        propertyId: payment.propertyId,
        unitId: payment.unitId,
        leaseId: payment.leaseId,
        tenantId: payment.tenantId,
        periodMonth: payment.month,
        dueDate: payment.dueDate,
        amountDue: payment.amountDue,
        createdAt: `${payment.dueDate}T12:00:00.000Z`,
        updatedAt: `${payment.dueDate}T12:00:00.000Z`,
      });
    }
  });

  return [...chargesById.values()].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

function normalizePaymentTransactions(paymentTransactions: PaymentTransaction[] | undefined): PaymentTransaction[] {
  return (Array.isArray(paymentTransactions) ? paymentTransactions : seedStore.paymentTransactions).map((transaction) => ({
    ...transaction,
    tenantId: transaction.tenantId ?? null,
    leaseId: transaction.leaseId ?? null,
    amountReceived: Number(transaction.amountReceived || 0),
    method: transaction.method ?? "virement",
    reference: transaction.reference ?? "",
    notes: transaction.notes ?? "",
    createdAt: transaction.createdAt || `${transaction.receivedAt}T12:00:00.000Z`,
    updatedAt: transaction.updatedAt || transaction.createdAt || `${transaction.receivedAt}T12:00:00.000Z`,
  }));
}

function normalizePaymentAllocations(paymentAllocations: PaymentAllocation[] | undefined): PaymentAllocation[] {
  return (Array.isArray(paymentAllocations) ? paymentAllocations : seedStore.paymentAllocations).map((allocation) => ({
    ...allocation,
    amountAllocated: Number(allocation.amountAllocated || 0),
    createdAt: allocation.createdAt || new Date().toISOString(),
  }));
}

function createRentChargeId(leaseId: string, periodMonth: string) {
  return `rent-charge-${leaseId}-${periodMonth}`;
}

function normalizeLeases(store: LocalStore, units: Unit[]): Lease[] {
  const storedLeases = Array.isArray((store as Partial<LocalStore>).leases)
    ? ((store as Partial<LocalStore>).leases as Lease[])
    : [];
  const leasesById = new Map<string, Lease>();
  const storedLeaseUnitIds = new Set(storedLeases.map((lease) => lease.unitId));

  seedStore.leases
    .filter((lease) => !storedLeaseUnitIds.has(lease.unitId))
    .forEach((lease) => leasesById.set(lease.id, normalizeLease(lease)));

  storedLeases.forEach((lease) => leasesById.set(lease.id, normalizeLease(lease)));

  const leaseUnitIds = new Set([...leasesById.values()].map((lease) => lease.unitId));
  deriveActiveLeasesFromUnits(units)
    .filter((lease) => !leaseUnitIds.has(lease.unitId))
    .forEach((lease) => leasesById.set(lease.id, lease));

  return [...leasesById.values()].sort((a, b) => {
    if (a.propertyId !== b.propertyId) {
      return a.propertyId.localeCompare(b.propertyId);
    }

    if (a.unitId !== b.unitId) {
      return a.unitId.localeCompare(b.unitId);
    }

    return b.startDate.localeCompare(a.startDate);
  });
}

function normalizeLeaseIntegrity(leases: Lease[], units: Unit[], tenants: Tenant[], properties: Property[]): Lease[] {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const propertyIds = new Set(properties.map((property) => property.id));
  const activeLeaseByUnitId = new Set<string>();

  // Existing localStorage data may predate the lease model. Invalid active
  // leases and duplicate active leases are ended, never deleted, so history is preserved.
  return [...leases]
    .sort((a, b) => compareLeaseRecency(b, a))
    .map((lease) => {
      if (lease.status !== "active") {
        return lease;
      }

      const unit = unitsById.get(lease.unitId);
      const tenant = tenantsById.get(lease.tenantId);
      const invalidLease =
        !unit ||
        !tenant ||
        Boolean(tenant.archivedAt) ||
        !propertyIds.has(lease.propertyId) ||
        (unit ? unit.propertyId !== lease.propertyId : false);
      const duplicateActiveLease = activeLeaseByUnitId.has(lease.unitId);

      if (invalidLease || duplicateActiveLease) {
        return {
          ...lease,
          status: "ended" as const,
          updatedAt: lease.updatedAt || new Date().toISOString(),
        };
      }

      activeLeaseByUnitId.add(lease.unitId);
      return lease;
    })
    .sort((a, b) => {
      if (a.propertyId !== b.propertyId) {
        return a.propertyId.localeCompare(b.propertyId);
      }

      if (a.unitId !== b.unitId) {
        return a.unitId.localeCompare(b.unitId);
      }

      return b.startDate.localeCompare(a.startDate);
    });
}

function compareLeaseRecency(a: Lease, b: Lease) {
  return (a.updatedAt ?? a.createdAt ?? a.startDate).localeCompare(b.updatedAt ?? b.createdAt ?? b.startDate);
}

function normalizeLease(lease: Lease): Lease {
  const createdAt = lease.createdAt || `${lease.startDate}T12:00:00.000Z`;

  return {
    ...lease,
    monthlyRent: Number(lease.monthlyRent || 0),
    paymentStatus: lease.paymentStatus || "à venir",
    status: lease.status || "active",
    notes: lease.notes ?? "",
    actualEndDate: lease.actualEndDate ?? null,
    terminationReason: lease.terminationReason ?? null,
    terminationNotes: lease.terminationNotes ?? null,
    createdAt,
    updatedAt: lease.updatedAt || createdAt,
  };
}

function normalizePayments(payments: PaymentRecord[], leases: Lease[]): PaymentRecord[] {
  return payments.map((payment) => {
    const relatedLease =
      (payment.leaseId ? leases.find((lease) => lease.id === payment.leaseId) : null) ??
      leases.find(
        (lease) =>
          lease.unitId === payment.unitId &&
          lease.tenantId === payment.tenantId &&
          payment.dueDate >= lease.startDate &&
          payment.dueDate <= lease.endDate,
      ) ??
      null;

    return {
      ...payment,
      leaseId: relatedLease?.id ?? payment.leaseId ?? null,
      tenantId: payment.tenantId ?? relatedLease?.tenantId ?? null,
      month: payment.month || payment.dueDate.slice(0, 7),
      amountDue: Number(payment.amountDue || 0),
      amountPaid: Number(payment.amountPaid || 0),
      paidAt: payment.paidAt ?? "",
      paymentType: payment.paymentType ?? "loyer",
      notes: payment.notes ?? "",
    };
  });
}

function deriveActiveLeasesFromUnits(units: Unit[]): Lease[] {
  return units
    .filter((unit) => Boolean(unit.tenantId))
    .map((unit) => {
      const createdAt = `${unit.leaseStartDate}T12:00:00.000Z`;

      return {
        id: `lease-${unit.id}-${unit.tenantId}`,
        propertyId: unit.propertyId,
        unitId: unit.id,
        tenantId: unit.tenantId as string,
        startDate: unit.leaseStartDate,
        endDate: unit.leaseEndDate,
        monthlyRent: unit.monthlyRent,
        paymentStatus: toRentPaymentStatus(unit.paymentStatus),
        status: "active" as const,
        notes: unit.notes,
        createdAt,
        updatedAt: createdAt,
      };
    });
}

function toRentPaymentStatus(status: PaymentStatus) {
  if (status === "paid") {
    return "payé";
  }

  if (status === "late") {
    return "en retard";
  }

  return "à venir";
}

function normalizeTasks(store: LocalStore): AppTask[] {
  const sourceTasks = Array.isArray(store.tasks) ? store.tasks : seedStore.tasks;
  const tasksById = new Map<string, AppTask>();

  sourceTasks.forEach((task) => {
    tasksById.set(task.id, {
      ...task,
      tenantId: task.tenantId ?? null,
      completed: Boolean(task.completed),
      priority: task.priority ?? "moyenne",
      dueDate: task.dueDate || new Date().toISOString().slice(0, 10),
      createdAt: task.createdAt || new Date().toISOString(),
    });
  });

  return [...tasksById.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function normalizeNotes(store: LocalStore, units: Unit[]): AppNote[] {
  const storedNotes = Array.isArray(store.notes) ? store.notes : [];
  const legacyUnitNotes = units
    .filter((unit) => unit.notes.trim())
    .map((unit) => ({
      id: `note-legacy-${unit.id}`,
      targetType: "logement" as const,
      targetId: unit.id,
      propertyId: unit.propertyId,
      unitId: unit.id,
      tenantId: unit.tenantId,
      content: unit.notes,
      createdAt: `${unit.leaseStartDate}T12:00:00.000Z`,
      updatedAt: `${unit.leaseStartDate}T12:00:00.000Z`,
    }));
  const notesById = new Map<string, AppNote>();

  [...seedStore.notes, ...legacyUnitNotes, ...storedNotes].forEach((note) => {
    notesById.set(note.id, {
      ...note,
      tenantId: note.tenantId ?? null,
      createdAt: note.createdAt || new Date().toISOString(),
      updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
    });
  });

  return [...notesById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function ensurePropertyUnits(store: LocalStore): Unit[] {
  const units = [...store.units];

  store.properties.forEach((property) => {
    if (property.propertyType === "immeuble") {
      return;
    }

    const expectedFloors = getDefaultFloorLabels(property.propertyType);
    const existingUnits = units.filter((unit) => unit.propertyId === property.id);

    expectedFloors.slice(existingUnits.length).forEach((floor, index) => {
      const unitNumber = existingUnits.length + index + 1;
      units.push(createSeedUnit(property, floor, unitNumber));
    });
  });

  return units;
}

function createSeedUnit(property: Property, floor: string, unitNumber: number): Unit {
  return {
    id: `${property.id}-unit-${unitNumber}`,
    propertyId: property.id,
    label: `Logement ${unitNumber}`,
    floor,
    floorIndex: unitNumber,
    monthlyRent: 0,
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    tenantId: null,
    paymentStatus: "paid",
    notes: "",
  };
}

function getDefaultFloorLabels(propertyType: Property["propertyType"]) {
  const labels: Record<Property["propertyType"], string[]> = {
    condo: ["Unit\u00e9 principale"],
    duplex: ["Rez-de-chauss\u00e9e", "2e \u00e9tage"],
    triplex: ["Rez-de-chauss\u00e9e", "2e \u00e9tage", "3e \u00e9tage"],
    quadruplex: ["Rez-de-chauss\u00e9e", "2e \u00e9tage", "3e \u00e9tage", "4e \u00e9tage"],
    immeuble: ["Logement 1", "Logement 2", "Logement 3", "Logement 4", "Logement 5"],
  };

  return labels[propertyType];
}

function normalizeActivityType(type: string): ActivityType {
  const legacyTypes: Record<string, ActivityType> = {
    payment: "paiement",
    maintenance: "entretien",
    lease: "bail",
    inspection: "immeuble",
    communication: "locataire",
    paiement: "paiement",
    entretien: "entretien",
    bail: "bail",
    document: "document",
    locataire: "locataire",
    immeuble: "immeuble",
    note: "note",
    tache: "tache",
  };

  return legacyTypes[type] ?? "immeuble";
}

function getDefaultActivityTitle(type: ActivityType) {
  const titles: Record<ActivityType, string> = {
    paiement: "Paiement",
    entretien: "Demande d'entretien",
    bail: "Bail",
    document: "Document",
    locataire: "Locataire",
    immeuble: "Immeuble",
    note: "Note",
    tache: "Tâche personnelle",
  };

  return titles[type];
}

function isLocalStore(value: unknown): value is LocalStore {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalStore>;

  return (
    Array.isArray(candidate.properties) &&
    Array.isArray(candidate.units) &&
    Array.isArray(candidate.tenants) &&
    Array.isArray(candidate.maintenanceTickets) &&
    Array.isArray(candidate.activities)
  );
}

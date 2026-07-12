export type Health = "ok" | "attention" | "issue";

export type PaymentStatus = "paid" | "dueSoon" | "late";

export type RentPaymentStatus = "payé" | "partiel" | "en retard" | "à venir";

export type PaymentType = "loyer" | "frais" | "dépôt" | "autre";

export type LeaseStatus = "active" | "ended" | "archived";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketStatus = "open" | "inProgress" | "resolved";

export type ActivityType = "paiement" | "bail" | "entretien" | "document" | "locataire" | "immeuble" | "note" | "tache";

export type TaskPriority = "faible" | "moyenne" | "élevée";

export type DocumentType = "bail" | "facture" | "photo" | "inspection" | "assurance" | "paiement" | "autre";

export type DocumentRelatedEntityType = "immeuble" | "logement" | "bail" | "entretien" | "paiement";

export type NoteTargetType = "immeuble" | "logement" | "locataire" | "entretien";

export type NotificationPriority = "urgent" | "attention" | "info";

export type NotificationItem = {
  id: string;
  priority: NotificationPriority;
  title: string;
  property: string;
  unit: string;
  tenant: string | null;
  recommendedAction: string;
  urgencyReason: string;
  relatedDeadline?: string;
  timing: string;
  sortDate: string;
  href: string;
};

export type Property = {
  id: string;
  name: string;
  address: string;
  city: string;
  province: "QC";
  postalCode: string;
  propertyType: "triplex" | "duplex" | "condo" | "quadruplex" | "immeuble";
};

export type PhysicalUnit = {
  id: string;
  propertyId: string;
  label: string;
  floor: string;
  floorIndex: number;
};

export type Unit = PhysicalUnit & {
  /**
   * Champs de compatibilité legacy. Dans le modèle cible, l'occupation et les
   * détails du bail doivent être dérivés du bail actif, pas du logement.
   */
  monthlyRent: number;
  leaseStartDate: string;
  leaseEndDate: string;
  tenantId: string | null;
  paymentStatus: PaymentStatus;
  notes: string;
};

export type Tenant = {
  id: string;
  fullName?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes?: string;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Lease = {
  id: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  paymentStatus: RentPaymentStatus;
  status: LeaseStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UnitOccupancy = {
  unit: PhysicalUnit;
  activeLease: Lease | null;
  tenant: Tenant | null;
};

export type MaintenanceTicket = {
  id: string;
  propertyId: string;
  unitId: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
};

export type UnitActivity = {
  id: string;
  propertyId?: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  type: ActivityType;
  title: string;
  description: string;
  date: string;
  createdAt?: string;
};

export type PropertyDocument = {
  id: string;
  name: string;
  type: DocumentType;
  propertyId: string;
  unitId: string;
  tenantId?: string | null;
  leaseId?: string | null;
  uploadDate: string;
  relatedEntityType?: DocumentRelatedEntityType;
  relatedEntityId?: string;
  uploadedAt?: string;
  fileDataUrl?: string;
  storagePath?: string;
  mimeType?: string;
  size?: number;
  notes?: string;
};

export type AppNote = {
  id: string;
  targetType: NoteTargetType;
  targetId: string;
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type AppTask = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: TaskPriority;
  dueDate: string;
  propertyId?: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export type PaymentRecord = {
  id: string;
  propertyId: string;
  unitId: string;
  leaseId?: string | null;
  tenantId: string | null;
  month: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: RentPaymentStatus;
  paidAt: string;
  paymentType?: PaymentType;
  notes: string;
};

export type LocalStore = {
  properties: Property[];
  units: Unit[];
  tenants: Tenant[];
  leases: Lease[];
  maintenanceTickets: MaintenanceTicket[];
  activities: UnitActivity[];
  documents: PropertyDocument[];
  payments: PaymentRecord[];
  notes: AppNote[];
  tasks: AppTask[];
};

export type UnitDashboard = Unit & {
  tenant: Tenant | null;
  openTickets: MaintenanceTicket[];
  activities: UnitActivity[];
  payments: PaymentRecord[];
  health: Health;
};

export type PropertyDashboard = Property & {
  units: UnitDashboard[];
  healthScore: number;
  monthlyRent: number;
  openTicketCount: number;
  issueCount: number;
};

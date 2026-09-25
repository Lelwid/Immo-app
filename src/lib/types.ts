export type Health = "ok" | "attention" | "issue";

export type PaymentStatus = "paid" | "dueSoon" | "late";

export type RentPaymentStatus = "payé" | "partiel" | "en retard" | "à venir";

export type PaymentType = "loyer" | "frais" | "dépôt" | "autre";

export type PaymentMethod = "virement" | "interac" | "cheque" | "especes" | "carte" | "autre";

export type LeaseStatus = "active" | "ended" | "archived";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketStatus = "open" | "inProgress" | "resolved";

export type ActivityType = "paiement" | "bail" | "entretien" | "document" | "locataire" | "immeuble" | "note" | "tache";

export type TaskPriority = "faible" | "moyenne" | "élevée";

export type DocumentType = "bail" | "avis" | "recu" | "facture" | "photo" | "inspection" | "assurance" | "paiement" | "autre";

export type DocumentRelatedEntityType = "immeuble" | "logement" | "locataire" | "bail" | "entretien" | "paiement";

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
  addressLine1?: string;
  streetNumber?: string;
  street?: string;
  city: string;
  district?: string;
  province: string;
  provinceCode?: string;
  postalCode: string;
  country?: string;
  countryCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  addressProvider?: string | null;
  addressProviderId?: string | null;
  propertyType: "triplex" | "duplex" | "condo" | "quadruplex" | "immeuble";
  archivedAt?: string | null;
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
  financialTrackingStartDate?: string | null;
  actualEndDate?: string | null;
  monthlyRent: number;
  paymentStatus: RentPaymentStatus;
  status: LeaseStatus;
  notes?: string;
  terminationReason?: string | null;
  terminationNotes?: string | null;
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
  tenantId?: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  completedAt?: string | null;
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
  visibility?: "private" | "tenant";
};

export type MaintenanceAttachment = {
  id: string;
  maintenanceRequestId: string;
  tenantId?: string | null;
  fileName: string;
  storagePath: string;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
};

export type LeaseExtraction = {
  tenantName?: string | null;
  tenantEmail?: string | null;
  tenantPhone?: string | null;
  propertyAddress?: string | null;
  propertyCity?: string | null;
  propertyProvince?: string | null;
  propertyPostalCode?: string | null;
  unitName?: string | null;
  unitNumber?: string | null;
  bedroomCount?: number | null;
  parking?: string | null;
  landlordName?: string | null;
  landlordAddress?: string | null;
  landlordPhone?: string | null;
  landlordEmail?: string | null;
  monthlyRent?: number | null;
  paymentFrequency?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  leaseDuration?: string | null;
  signedDate?: string | null;
  dueDay?: number | null;
  paymentMethod?: string | null;
  securityDeposit?: number | null;
  signerNames?: string[] | null;
  inclusions?: {
    appliances?: boolean | null;
    electricity?: boolean | null;
    furniture?: boolean | null;
    heating?: boolean | null;
    hotWater?: boolean | null;
    internet?: boolean | null;
    parking?: boolean | null;
    water?: boolean | null;
    other?: string | null;
  };
  importantNotes?: string | null;
  documentType?: string | null;
  confidenceByField?: Record<string, number>;
  sourceTextByField?: Record<string, string | null>;
  structuredFields?: LeaseStructuredExtraction;
};

export type DocumentAiExtractionStatus = "pending" | "processing" | "completed" | "failed";
export type DocumentAiExtractionMethod = "native" | "ocr" | "vision";
export type DocumentAnalysisErrorCode =
  | "AI_QUOTA_EXCEEDED"
  | "PDF_READ_ERROR"
  | "PDF_INVALID"
  | "IMAGE_INVALID"
  | "IMAGE_QUALITY_ERROR"
  | "OCR_REQUIRED"
  | "OCR_NOT_CONFIGURED"
  | "OCR_ERROR"
  | "OPENAI_NOT_CONFIGURED"
  | "AI_MODEL_NOT_CONFIGURED"
  | "OPENAI_AUTH_ERROR"
  | "OPENAI_MODEL_ERROR"
  | "OPENAI_RATE_LIMIT"
  | "AI_ANALYSIS_ERROR"
  | "AI_SCHEMA_ERROR"
  | "DATABASE_ERROR"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_FILE_MISSING"
  | "UNAUTHORIZED"
  | "UNSUPPORTED_DOCUMENT";

export type AiField<T> = {
  value: T | null;
  confidence: number;
  sourceText?: string | null;
};

export type LeaseStructuredExtraction = {
  property: {
    address: AiField<string>;
    bedroomCount: AiField<number>;
    city: AiField<string>;
    parking: AiField<string>;
    postalCode: AiField<string>;
    province: AiField<string>;
    unit: AiField<string>;
  };
  landlord: {
    address: AiField<string>;
    email: AiField<string>;
    name: AiField<string>;
    phone: AiField<string>;
  };
  tenants: Array<{
    email: AiField<string>;
    firstName: AiField<string>;
    lastName: AiField<string>;
    phone: AiField<string>;
  }>;
  lease: {
    duration: AiField<string>;
    endDate: AiField<string>;
    signedDate: AiField<string>;
    startDate: AiField<string>;
  };
  rent: {
    amount: AiField<number>;
    frequency: AiField<string>;
    paymentDay: AiField<number>;
    paymentMethod: AiField<string>;
  };
  inclusions: {
    appliances: AiField<boolean>;
    electricity: AiField<boolean>;
    furniture: AiField<boolean>;
    heating: AiField<boolean>;
    hotWater: AiField<boolean>;
    internet: AiField<boolean>;
    other: AiField<string>;
    parking: AiField<boolean>;
    water: AiField<boolean>;
  };
  rules: {
    animals: AiField<string>;
    importantNotes: AiField<string>;
    smoking: AiField<string>;
    subletting: AiField<string>;
  };
  documentType: AiField<string>;
};

export type DocumentAiExtraction = {
  id: string;
  documentId: string;
  status: DocumentAiExtractionStatus;
  documentType?: string | null;
  extractionMethod?: DocumentAiExtractionMethod | null;
  pageCount?: number | null;
  rawText?: string | null;
  structuredData: LeaseExtraction;
  confidence: Record<string, number>;
  model?: string | null;
  errorMessage?: string | null;
  analyzedAt?: string | null;
  createdAt: string;
  updatedAt: string;
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

export type RentCharge = {
  id: string;
  propertyId: string;
  unitId: string;
  leaseId: string;
  tenantId: string | null;
  periodMonth: string;
  dueDate: string;
  amountDue: number;
  createdAt?: string;
  updatedAt?: string;
};

export type PaymentTransaction = {
  id: string;
  propertyId: string;
  leaseId?: string | null;
  tenantId: string | null;
  cancelledAt?: string | null;
  receivedAt: string;
  amountReceived: number;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PaymentAllocation = {
  id: string;
  transactionId: string;
  rentChargeId: string;
  amountAllocated: number;
  createdAt?: string;
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
  rentCharges: RentCharge[];
  paymentTransactions: PaymentTransaction[];
  paymentAllocations: PaymentAllocation[];
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

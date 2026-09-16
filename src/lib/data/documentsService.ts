import { shouldUseSupabase } from "@/lib/data/dataMode";
import { validateDocumentFile } from "@/lib/fileValidation";
import { loadLocalStore, saveLocalStore } from "@/lib/local-storage";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { DocumentRelatedEntityType, DocumentType, PropertyDocument } from "@/lib/types";

const table = "documents";
const documentsBucket = "documents";
const signedUrlExpiresIn = 60 * 10;

type SupabaseDocumentRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  unit_id: string | null;
  tenant_id: string | null;
  lease_id: string | null;
  title: string;
  document_type: string;
  file_name: string | null;
  file_url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  notes: string | null;
  uploaded_at: string;
  created_at?: string;
  updated_at?: string;
  visibility?: string | null;
};

export type DocumentInput = {
  id?: string;
  name: string;
  type: DocumentType;
  propertyId?: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
  uploadDate?: string;
  relatedEntityType?: DocumentRelatedEntityType;
  relatedEntityId?: string;
  uploadedAt?: string;
  fileDataUrl?: string;
  storagePath?: string;
  mimeType?: string;
  size?: number;
  notes?: string;
  visibility?: PropertyDocument["visibility"];
};

export type DocumentUpdateInput = Partial<DocumentInput>;

const loadError = "Impossible de charger les documents.";
const createError = "Impossible de créer le document.";
const updateError = "Impossible de modifier le document.";
const deleteError = "Impossible de supprimer le document.";
const uploadError = "Impossible de téléverser le fichier.";
const downloadError = "Impossible de préparer le téléchargement du document.";
const previewError = "Impossible de préparer l'aperçu du document.";

export async function getDocuments(): Promise<PropertyDocument[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw createDocumentsServiceError(loadError, error, {
        operation: "select",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(loadError);
    }

    return sortDocuments(data.map(fromSupabaseRow));
  }

  return sortDocuments(loadLocalStore().documents);
}

export async function getDocumentsForProperty(propertyId: string): Promise<PropertyDocument[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("property_id", propertyId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw createDocumentsServiceError(loadError, error, {
        filters: ["property_id"],
        operation: "select",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(loadError);
    }

    return sortDocuments(data.map(fromSupabaseRow));
  }

  return sortDocuments(loadLocalStore().documents.filter((document) => document.propertyId === propertyId));
}

export async function getDocumentsForUnit(unitId: string): Promise<PropertyDocument[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("unit_id", unitId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw createDocumentsServiceError(loadError, error, {
        filters: ["unit_id"],
        operation: "select",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(loadError);
    }

    return sortDocuments(data.map(fromSupabaseRow));
  }

  return sortDocuments(loadLocalStore().documents.filter((document) => document.unitId === unitId));
}

export async function getDocumentsForTenant(tenantId: string): Promise<PropertyDocument[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("tenant_id", tenantId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw createDocumentsServiceError(loadError, error, {
        filters: ["tenant_id"],
        operation: "select",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(loadError);
    }

    return sortDocuments(data.map(fromSupabaseRow));
  }

  return sortDocuments(loadLocalStore().documents.filter((document) => document.tenantId === tenantId));
}

export async function getDocumentsForLease(leaseId: string): Promise<PropertyDocument[]> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("lease_id", leaseId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      throw createDocumentsServiceError(loadError, error, {
        filters: ["lease_id"],
        operation: "select",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(loadError);
    }

    return sortDocuments(data.map(fromSupabaseRow));
  }

  return sortDocuments(
    loadLocalStore().documents.filter(
      (document) => document.leaseId === leaseId || (document.relatedEntityType === "bail" && document.relatedEntityId === leaseId),
    ),
  );
}

export async function createDocument(input: DocumentInput): Promise<PropertyDocument> {
  const documentInput = normalizeDocumentInput(input);

  if (canUseSupabase()) {
    const userId = await getCurrentUserId(createError);
    const { data, error } = await supabase!
      .from(table)
      .insert(toSupabaseInsert(documentInput, userId))
      .select(selectColumns)
      .single();

    if (error) {
      throw createDocumentsServiceError(createError, error, {
        operation: "insert",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(createError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const document: PropertyDocument = {
    ...documentInput,
    id: documentInput.id || createLocalDocumentId(),
  };

  saveLocalStore({
    ...store,
    documents: upsertLocalDocument(store.documents, document),
  });

  return document;
}

export async function createDocumentWithFile(input: DocumentInput, file: File): Promise<PropertyDocument> {
  if (!canUseSupabase()) {
    return createDocument({
      ...input,
      fileDataUrl: await readFileAsDataUrl(file),
      mimeType: file.type,
      size: file.size,
      name: input.name || file.name,
    });
  }

  let document: PropertyDocument | null = null;
  let uploadedStoragePath = "";

  try {
    document = await createDocument({
      ...input,
      fileDataUrl: "",
      mimeType: file.type,
      size: file.size,
      name: input.name || file.name,
    });

    const { storagePath } = await uploadDocumentFile(document, file);
    uploadedStoragePath = storagePath;

    return updateDocument(document.id, {
      ...document,
      fileDataUrl: "",
      storagePath,
      mimeType: file.type,
      size: file.size,
      name: input.name || file.name,
    });
  } catch (error) {
    if (document && uploadedStoragePath) {
      try {
        await deleteDocumentFile({ ...document, storagePath: uploadedStoragePath });
      } catch (fileRollbackError) {
        console.warn("Impossible de supprimer le fichier téléversé après un échec de création du document.", fileRollbackError);
      }
    }

    if (document) {
      try {
        await deleteDocument(document.id);
      } catch (rollbackError) {
        console.warn("Impossible d'annuler la création du document après un échec de téléversement.", rollbackError);
      }
    }

    console.error(uploadError, error);
    throw new Error(uploadError);
  }
}

export async function updateDocument(documentId: string, input: DocumentUpdateInput): Promise<PropertyDocument> {
  if (canUseSupabase()) {
    const existing = await getDocumentById(documentId, updateError);
    const nextInput = normalizeDocumentInput({ ...existing, ...input, id: documentId });
    const { data, error } = await supabase!
      .from(table)
      .update(toSupabaseUpdate(nextInput))
      .eq("id", documentId)
      .select(selectColumns)
      .single();

    if (error) {
      throw createDocumentsServiceError(updateError, error, {
        filters: ["id"],
        operation: "update",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(updateError);
    }

    return fromSupabaseRow(data);
  }

  const store = loadLocalStore();
  const existing = store.documents.find((document) => document.id === documentId);

  if (!existing) {
    throw new Error(updateError);
  }

  const nextDocument = normalizeDocumentRecord({ ...existing, ...input, id: documentId });

  saveLocalStore({
    ...store,
    documents: store.documents.map((document) => (document.id === documentId ? nextDocument : document)),
  });

  return nextDocument;
}

export async function deleteDocument(documentId: string): Promise<void> {
  if (canUseSupabase()) {
    const existing = await getDocumentById(documentId, deleteError);
    const { error } = await supabase!.from(table).delete().eq("id", documentId);

    if (error) {
      throw createDocumentsServiceError(deleteError, error, {
        filters: ["id"],
        operation: "delete",
        table,
      });
    }

    try {
      await deleteDocumentFile(existing);
    } catch (fileError) {
      console.warn("Le document a été supprimé, mais le fichier Storage n'a pas pu être supprimé.", fileError);
    }

    return;
  }

  const store = loadLocalStore();
  saveLocalStore({
    ...store,
    documents: store.documents.filter((document) => document.id !== documentId),
  });
}

export async function cleanupOnboardingPlaceholderDocuments(): Promise<number> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!.from(table).select(selectColumns);

    if (error) {
      throw createDocumentsServiceError(deleteError, error, {
        operation: "select",
        selectedColumns: selectColumns,
        table,
      });
    }

    if (!data) {
      throw new Error(deleteError);
    }

    const placeholders = data.map(fromSupabaseRow).filter(isOnboardingPlaceholderDocument);

    if (placeholders.length === 0) {
      return 0;
    }

    const { error: deletePlaceholdersError } = await supabase!
      .from(table)
      .delete()
      .in("id", placeholders.map((document) => document.id));

    if (deletePlaceholdersError) {
      throw createDocumentsServiceError(deleteError, deletePlaceholdersError, {
        filters: ["id"],
        operation: "delete",
        table,
      });
    }

    return placeholders.length;
  }

  const store = loadLocalStore();
  const nextDocuments = store.documents.filter((document) => !isOnboardingPlaceholderDocument(normalizeDocumentRecord(document)));
  const removedCount = store.documents.length - nextDocuments.length;

  if (removedCount > 0) {
    saveLocalStore({
      ...store,
      documents: nextDocuments,
    });
  }

  return removedCount;
}

export async function listDocuments(unitId?: string): Promise<PropertyDocument[]> {
  return unitId ? getDocumentsForUnit(unitId) : getDocuments();
}

export async function upsertDocument(document: PropertyDocument) {
  const documents = await getDocuments();
  const existing = documents.find((candidate) => candidate.id === document.id);

  return existing ? updateDocument(document.id, document) : createDocument(document);
}

export async function uploadDocumentFile(document: PropertyDocument, file: File): Promise<{ storagePath: string }> {
  const validationError = validateDocumentFile(file);

  if (validationError) {
    throw new Error(validationError);
  }

  if (!canUseSupabase()) {
    return { storagePath: "" };
  }

  const userId = await getCurrentUserId(uploadError);
  const storagePath = buildStoragePath(userId, document, file.name);
  const { error } = await supabase!.storage.from(documentsBucket).upload(storagePath, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });

  if (error) {
    throw new Error(uploadError);
  }

  return { storagePath };
}

export async function getDocumentDownloadUrl(document: PropertyDocument): Promise<string | null> {
  if (!canUseSupabase()) {
    return document.fileDataUrl ?? null;
  }

  const publicOrLocalUrl = getPublicOrLocalFileUrl(document);

  if (publicOrLocalUrl) {
    return publicOrLocalUrl;
  }

  const storagePath = getStoragePath(document);

  if (!storagePath) {
    return null;
  }

  const { data, error } = await supabase!.storage.from(documentsBucket).createSignedUrl(storagePath, signedUrlExpiresIn, {
    download: document.name,
  });

  if (error || !data?.signedUrl) {
    throw new Error(downloadError);
  }

  return data.signedUrl;
}

export async function getDocumentPreviewUrl(document: PropertyDocument): Promise<string | null> {
  if (!canUseSupabase()) {
    return document.fileDataUrl ?? null;
  }

  const publicOrLocalUrl = getPublicOrLocalFileUrl(document);

  if (publicOrLocalUrl) {
    return publicOrLocalUrl;
  }

  const storagePath = getStoragePath(document);

  if (!storagePath) {
    return null;
  }

  const { data, error } = await supabase!.storage.from(documentsBucket).createSignedUrl(storagePath, signedUrlExpiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(previewError);
  }

  return data.signedUrl;
}

export async function deleteDocumentFile(document: PropertyDocument): Promise<void> {
  if (!canUseSupabase()) {
    return;
  }

  const storagePath = getStoragePath(document);

  if (!storagePath) {
    return;
  }

  const { error } = await supabase!.storage.from(documentsBucket).remove([storagePath]);

  if (error) {
    throw new Error("Impossible de supprimer le fichier du document.");
  }
}

export function hasDocumentFile(document: PropertyDocument) {
  return Boolean(document.fileDataUrl || getStoragePath(document));
}

export function isOnboardingPlaceholderDocument(document: PropertyDocument) {
  const generatedName = /^Dossier (bail|assurance|inspection|facture|autre)$/i.test(document.name.trim());
  return generatedName && !document.fileDataUrl && !document.storagePath && !document.mimeType && !document.size && !getStoragePath(document);
}

const selectColumns =
  "id,user_id,property_id,unit_id,tenant_id,lease_id,title,document_type,file_name,file_url,storage_path,mime_type,size_bytes,related_entity_type,related_entity_id,notes,uploaded_at,created_at,updated_at,visibility";

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

async function getDocumentById(documentId: string, errorMessage: string): Promise<PropertyDocument> {
  const { data, error } = await supabase!.from(table).select(selectColumns).eq("id", documentId).single();

  if (error) {
    throw createDocumentsServiceError(errorMessage, error, {
      filters: ["id"],
      operation: "select",
      selectedColumns: selectColumns,
      table,
    });
  }

  if (!data) {
    throw new Error(errorMessage);
  }

  return fromSupabaseRow(data);
}

function createDocumentsServiceError(
  message: string,
  error: SupabaseErrorLike,
  context: {
    filters?: string[];
    operation: string;
    selectedColumns?: string;
    table: string;
  },
) {
  const nextError = new Error(process.env.NODE_ENV === "development" ? `${message} ${error.message}`.trim() : message);
  (nextError as Error & { cause?: unknown }).cause = {
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    message: error.message,
    ...context,
  };

  return nextError;
}

type SupabaseErrorLike = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message: string;
};

function fromSupabaseRow(row: SupabaseDocumentRow): PropertyDocument {
  const uploadedAt = row.uploaded_at;
  const storagePath = row.storage_path ?? getStoragePathFromFileUrl(row.file_url);
  const fileDataUrl = row.file_url && !storagePath ? row.file_url : undefined;

  return {
    id: row.id,
    name: row.title || row.file_name || "Document",
    type: normalizeDocumentType(row.document_type),
    propertyId: row.property_id ?? "",
    unitId: row.unit_id ?? "",
    tenantId: row.tenant_id,
    leaseId: row.lease_id,
    uploadDate: uploadedAt.slice(0, 10),
    relatedEntityType: normalizeRelatedEntityType(row.related_entity_type),
    relatedEntityId: row.related_entity_id ?? undefined,
    uploadedAt,
    fileDataUrl,
    storagePath,
    mimeType: row.mime_type ?? undefined,
    size: row.size_bytes ?? undefined,
    notes: row.notes ?? undefined,
    visibility: normalizeVisibility(row.visibility),
  };
}

function toSupabaseInsert(input: Required<DocumentInput>, userId: string) {
  return {
    ...(isUuid(input.id) ? { id: input.id } : {}),
    ...toSupabaseUpdate(input),
    user_id: userId,
  };
}

function toSupabaseUpdate(input: Required<DocumentInput>) {
  return {
    property_id: input.propertyId || null,
    unit_id: input.unitId || null,
    tenant_id: input.tenantId || null,
    lease_id: input.leaseId || null,
    title: input.name,
    document_type: input.type,
    file_name: input.name,
    file_url: input.fileDataUrl || null,
    storage_path: input.storagePath || null,
    mime_type: input.mimeType || null,
    size_bytes: input.size || null,
    related_entity_type: input.relatedEntityType || null,
    related_entity_id: input.relatedEntityId || null,
    notes: input.notes?.trim() || null,
    uploaded_at: input.uploadedAt,
    visibility: input.visibility ?? "private",
  };
}

function normalizeDocumentInput(input: DocumentInput): Required<DocumentInput> {
  const uploadedAt = input.uploadedAt || new Date().toISOString();

  return {
    id: input.id ?? "",
    name: input.name.trim(),
    type: normalizeDocumentType(input.type),
    propertyId: input.propertyId ?? "",
    unitId: input.unitId ?? "",
    tenantId: input.tenantId ?? null,
    leaseId: input.leaseId ?? null,
    uploadDate: input.uploadDate || uploadedAt.slice(0, 10),
    relatedEntityType: input.relatedEntityType ?? "logement",
    relatedEntityId: input.relatedEntityId ?? input.unitId ?? "",
    uploadedAt,
    fileDataUrl: input.fileDataUrl ?? "",
    storagePath: input.storagePath ?? "",
    mimeType: input.mimeType ?? "",
    size: Number(input.size || 0),
    notes: input.notes ?? "",
    visibility: input.visibility ?? "private",
  };
}

function normalizeDocumentRecord(document: PropertyDocument): PropertyDocument {
  const uploadedAt = document.uploadedAt ?? `${document.uploadDate}T12:00:00.000Z`;

  return {
    ...document,
    type: normalizeDocumentType(document.type),
    propertyId: document.propertyId ?? "",
    unitId: document.unitId ?? "",
    tenantId: document.tenantId ?? null,
    leaseId: document.leaseId ?? null,
    uploadDate: document.uploadDate || uploadedAt.slice(0, 10),
    relatedEntityType: normalizeRelatedEntityType(document.relatedEntityType) ?? "logement",
    relatedEntityId: document.relatedEntityId ?? document.unitId,
    uploadedAt,
    fileDataUrl: document.fileDataUrl ?? undefined,
    storagePath: document.storagePath ?? undefined,
    mimeType: document.mimeType ?? undefined,
    size: document.size ?? undefined,
    notes: document.notes ?? undefined,
    visibility: document.visibility ?? "private",
  };
}

function normalizeVisibility(value: string | null | undefined): PropertyDocument["visibility"] {
  return value === "tenant" ? "tenant" : "private";
}

function normalizeDocumentType(value: string | null | undefined): DocumentType {
  if (
    value === "bail" ||
    value === "avis" ||
    value === "recu" ||
    value === "facture" ||
    value === "photo" ||
    value === "inspection" ||
    value === "assurance" ||
    value === "paiement" ||
    value === "autre"
  ) {
    return value;
  }

  return "autre";
}

function normalizeRelatedEntityType(value: string | null | undefined): DocumentRelatedEntityType | undefined {
  if (value === "immeuble" || value === "logement" || value === "locataire" || value === "bail" || value === "entretien" || value === "paiement") {
    return value;
  }

  return undefined;
}

function sortDocuments(documents: PropertyDocument[]) {
  return [...documents]
    .map(normalizeDocumentRecord)
    .filter((document) => !isOnboardingPlaceholderDocument(document))
    .sort((a, b) => (b.uploadedAt ?? b.uploadDate).localeCompare(a.uploadedAt ?? a.uploadDate));
}

function upsertLocalDocument(documents: PropertyDocument[], document: PropertyDocument) {
  return documents.some((candidate) => candidate.id === document.id)
    ? documents.map((candidate) => (candidate.id === document.id ? document : candidate))
    : [...documents, document];
}

function createLocalDocumentId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `document-${crypto.randomUUID()}`;
  }

  return `document-${Date.now()}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getStoragePath(document: PropertyDocument) {
  return document.storagePath || getStoragePathFromFileUrl(document.fileDataUrl);
}

function getStoragePathFromFileUrl(fileUrl: string | null | undefined) {
  if (!fileUrl || fileUrl.startsWith("data:") || fileUrl.startsWith("http:") || fileUrl.startsWith("https:") || fileUrl.startsWith("blob:")) {
    return undefined;
  }

  return fileUrl;
}

function getPublicOrLocalFileUrl(document: PropertyDocument) {
  if (!document.fileDataUrl) {
    return null;
  }

  return getStoragePathFromFileUrl(document.fileDataUrl) ? null : document.fileDataUrl;
}

function buildStoragePath(userId: string, document: PropertyDocument, fileName: string) {
  const cleanPropertyId = sanitizePathSegment(document.propertyId || "portfolio");
  const cleanDocumentId = sanitizePathSegment(document.id);
  const cleanFileName = sanitizeFileName(fileName || document.name || "document");

  return `${userId}/${cleanPropertyId}/${cleanDocumentId}/${cleanFileName}`;
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "document";
}

function sanitizeFileName(value: string) {
  const clean = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 180);

  return clean || "document";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

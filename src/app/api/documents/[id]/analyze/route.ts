import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { analyzeLeaseText } from "@/lib/ai/lease-analyzer";
import { extractDocumentContent, type AdditionalImagePageInput } from "@/lib/server/documentContentExtractor";
import { getDevelopmentErrorDetails, getPublicAnalysisMessage, HabixaAnalysisError, sanitizeCause, toHabixaAnalysisError } from "@/lib/server/habixaAiErrors";
import { consumeAiQuota } from "@/lib/server/aiRateLimit";
import type { DocumentAiExtraction, DocumentAiExtractionMethod, DocumentAnalysisErrorCode, LeaseExtraction, PropertyDocument } from "@/lib/types";

export const runtime = "nodejs";

const documentsTable = "documents";
const extractionsTable = "document_ai_extractions";
const documentsBucket = "documents";
const maxRequestBytes = 64 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const localDocumentIdPattern = /^[a-zA-Z0-9-]{1,80}$/;
const selectDocumentColumns =
  "id,user_id,property_id,unit_id,tenant_id,lease_id,title,document_type,file_name,file_url,storage_path,mime_type,size_bytes,related_entity_type,related_entity_id,notes,uploaded_at";
const selectExtractionBaseColumns =
  "id,document_id,status,document_type,raw_text,structured_data,confidence,model,error_message,created_at,updated_at";
const selectExtractionExtendedColumns =
  "id,document_id,status,document_type,extraction_method,page_count,raw_text,structured_data,confidence,model,error_message,analyzed_at,created_at,updated_at";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AnalysisStep =
  | "starting"
  | "auth"
  | "cache_lookup"
  | "document_load"
  | "database_insert"
  | "file_download"
  | "image_validation"
  | "image_quality"
  | "pdf_extraction"
  | "vision_extraction"
  | "ai_analysis"
  | "schema_validation"
  | "database_update"
  | "complete";

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
};

type SupabaseExtractionRow = {
  id: string;
  document_id: string;
  status: string;
  document_type: string | null;
  raw_text: string | null;
  structured_data: LeaseExtraction | null;
  confidence: Record<string, number> | null;
  extraction_method?: string | null;
  page_count?: number | null;
  model: string | null;
  error_message: string | null;
  analyzed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: documentId } = await context.params;

  try {
    if (isRequestTooLarge(request, maxRequestBytes)) {
      return NextResponse.json({ error: "La requête est trop volumineuse.", status: "failed" }, { status: 413 });
    }

    const authenticated = await getAuthenticatedSupabase(request);

    if (!authenticated) {
      throw new HabixaAnalysisError("UNAUTHORIZED", "Session invalide.", { step: "auth" });
    }

    const body = await readJsonBody<Record<string, unknown>>(request, maxRequestBytes);

    if (!body) {
      return NextResponse.json({ error: "Requête invalide ou trop volumineuse.", status: "failed" }, { status: 400 });
    }

    const reanalyze = body.reanalyze === true;
    const additionalImagePages = getAdditionalImagePages(body);
    const localDocument = body.localDocument as Partial<PropertyDocument> | undefined;
    const localMode = Boolean(localDocument);

    if ((localMode && !localDocumentIdPattern.test(documentId)) || (!localMode && !uuidPattern.test(documentId))) {
      return NextResponse.json({ error: "Identifiant de document invalide.", status: "failed" }, { status: 400 });
    }

    const quota = await consumeAiQuota(authenticated.supabase, "document_ai");
    if (!quota.allowed) {
      return NextResponse.json(
        { code: "AI_QUOTA_EXCEEDED", error: "Limite d’analyses atteinte. Réessayez plus tard.", status: "failed" },
        { headers: { "Retry-After": String(quota.retryAfterSeconds) }, status: 429 },
      );
    }

    logAnalysisStep("starting", {
      additionalImagePageCount: additionalImagePages.length,
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      hasOcrEndpoint: Boolean(process.env.OCR_ENDPOINT || process.env.HABIXA_OCR_ENDPOINT),
      model: process.env.HABIXA_AI_MODEL || "gpt-4.1-mini",
      ocrProvider: process.env.OCR_PROVIDER || process.env.HABIXA_OCR_PROVIDER || "none",
      supabaseConfigured: isSupabaseServerConfigured(),
    });

    if (!localMode) {
      return await analyzeSupabaseDocument(documentId, authenticated.supabase, authenticated.userId, reanalyze, additionalImagePages);
    }

    return await analyzeLocalDocument(documentId, localDocument, additionalImagePages);
  } catch (error) {
    const analysisError = toHabixaAnalysisError(error, "AI_ANALYSIS_ERROR", "starting");

    logAnalysisError(analysisError.step ?? "starting", analysisError);

    return createAnalysisErrorResponse(analysisError);
  }
}

async function analyzeSupabaseDocument(
  documentId: string,
  supabase: SupabaseClient,
  userId: string,
  reanalyze: boolean,
  additionalImagePages: AdditionalImagePageInput[],
) {
  logAnalysisStep("auth", { authenticated: Boolean(userId) });

  if (!reanalyze) {
    const cached = await getLatestCompletedExtraction(supabase, documentId);

    if (cached) {
      logAnalysisStep("complete", { cacheHit: true, documentId });
      return NextResponse.json({ extractionRecord: cached, status: cached.status });
    }
  }

  const { data: documentRow, error: documentError } = await supabase
    .from(documentsTable)
    .select(selectDocumentColumns)
    .eq("id", documentId)
    .single();

  if (documentError || !documentRow) {
    throw new HabixaAnalysisError("DOCUMENT_NOT_FOUND", "Document introuvable ou inaccessible.", { cause: documentError, step: "document_load" });
  }

  const document = fromSupabaseDocumentRow(documentRow);

  if (document.type !== "bail") {
    throw new HabixaAnalysisError("UNSUPPORTED_DOCUMENT", "Seuls les documents de type Bail peuvent être analysés.", { step: "document_load" });
  }

  const storagePath = document.storagePath;

  if (!storagePath) {
    throw new HabixaAnalysisError("DOCUMENT_FILE_MISSING", "Aucun fichier téléversé pour ce document.", { step: "document_load" });
  }

  logAnalysisStep("document_load", {
    documentId,
    hasStoragePath: Boolean(storagePath),
    mimeType: document.mimeType,
    sizeBytes: document.size ?? null,
  });

  const processing = await insertExtraction(supabase, {
    documentId,
    documentType: "bail",
    status: "processing",
    userId,
  });

  try {
    logAnalysisStep("file_download", { documentId });

    const { data: fileData, error: fileError } = await supabase.storage.from(documentsBucket).download(storagePath);

    if (fileError || !fileData) {
      throw new HabixaAnalysisError("DOCUMENT_FILE_MISSING", "Impossible de récupérer le fichier du bail.", { cause: fileError, step: "file_download" });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    logAnalysisStep("pdf_extraction", { additionalImagePageCount: additionalImagePages.length, documentId, fileBytes: fileBuffer.byteLength });
    const contentResult = await extractDocumentContent(
      {
        file: fileBuffer,
        fileName: document.name,
        mimeType: document.mimeType,
      },
      { additionalImagePages },
    );
    logAnalysisStep(contentResult.extractionMethod === "vision" ? "vision_extraction" : "pdf_extraction", {
      documentId,
      extractionMethod: contentResult.extractionMethod,
      imagePageCount: contentResult.images.length,
      pageCount: contentResult.pageCount,
      qualityWarningCount: contentResult.qualityWarnings.length,
      requiresOcr: contentResult.requiresOcr,
      textLength: contentResult.text.length,
    });
    const aiResult = await analyzeLeaseText({
      context: {
        documentName: document.name,
      },
      images: contentResult.images,
      text: contentResult.text,
    });
    logAnalysisStep("ai_analysis", { documentId, imagePageCount: contentResult.images.length, model: aiResult.model, textLength: contentResult.text.length });
    logAnalysisStep("schema_validation", { documentId, fields: Object.keys(aiResult.extraction.confidenceByField ?? {}).length });
    logAnalysisStep("database_update", { documentId });
    const completed = await updateExtraction(supabase, processing.id, {
      confidence: aiResult.extraction.confidenceByField ?? {},
      documentType: aiResult.extraction.documentType ?? "bail",
      errorMessage: null,
      extractionMethod: contentResult.extractionMethod,
      model: aiResult.model,
      pageCount: contentResult.pageCount,
      rawText: contentResult.text || buildVisionRawTextSummary(contentResult),
      status: "completed",
      structuredData: aiResult.extraction,
    });

    logAnalysisStep("complete", { documentId, extractionId: completed.id });

    return NextResponse.json({ extractionRecord: completed, status: "completed" });
  } catch (error) {
    const analysisError = toHabixaAnalysisError(error, "AI_ANALYSIS_ERROR");
    let failed: DocumentAiExtraction | null = null;

    logAnalysisError(analysisError.step ?? "complete", analysisError);

    try {
      failed = await updateExtraction(supabase, processing.id, {
        confidence: {},
        documentType: "bail",
        errorMessage: getPublicAnalysisMessage(analysisError),
        extractionMethod: null,
        model: process.env.OPENAI_API_KEY ? process.env.HABIXA_AI_MODEL || "gpt-4.1-mini" : "unknown",
        pageCount: null,
        rawText: null,
        status: "failed",
        structuredData: {},
      });
    } catch (saveError) {
      logAnalysisError("database_update", toHabixaAnalysisError(saveError, "DATABASE_ERROR", "database_update"));
    }

    return NextResponse.json(
      {
        code: analysisError.code,
        details: getDevelopmentErrorDetails(analysisError),
        error: getPublicAnalysisMessage(analysisError),
        extractionRecord: failed,
        status: "failed",
      },
      { status: getHttpStatusForError(analysisError.code) },
    );
  }
}

async function analyzeLocalDocument(documentId: string, localDocument: Partial<PropertyDocument> | undefined, additionalImagePages: AdditionalImagePageInput[]) {
  if (!localDocument || localDocument.id !== documentId || localDocument.type !== "bail") {
    throw new HabixaAnalysisError("DOCUMENT_NOT_FOUND", "Document local introuvable ou incompatible.", { step: "document_load" });
  }

  const fileDataUrl = localDocument.fileDataUrl;

  if (!fileDataUrl) {
    throw new HabixaAnalysisError("DOCUMENT_FILE_MISSING", "Aucun fichier téléversé pour ce document.", { step: "document_load" });
  }

  logAnalysisStep("document_load", {
    documentId,
    localMode: true,
    mimeType: localDocument.mimeType ?? null,
  });
  const { buffer, mimeType } = decodeDataUrl(fileDataUrl);
  logAnalysisStep("pdf_extraction", { additionalImagePageCount: additionalImagePages.length, documentId, fileBytes: buffer.byteLength, localMode: true });
  const contentResult = await extractDocumentContent(
    {
      file: buffer,
      fileName: localDocument.name,
      mimeType: localDocument.mimeType || mimeType,
    },
    { additionalImagePages },
  );
  logAnalysisStep(contentResult.extractionMethod === "vision" ? "vision_extraction" : "pdf_extraction", {
    documentId,
    extractionMethod: contentResult.extractionMethod,
    imagePageCount: contentResult.images.length,
    localMode: true,
    pageCount: contentResult.pageCount,
    qualityWarningCount: contentResult.qualityWarnings.length,
    requiresOcr: contentResult.requiresOcr,
    textLength: contentResult.text.length,
  });
  logAnalysisStep("ai_analysis", { documentId, imagePageCount: contentResult.images.length, localMode: true, model: process.env.HABIXA_AI_MODEL || "gpt-4.1-mini", textLength: contentResult.text.length });
  const aiResult = await analyzeLeaseText({
    context: {
      documentName: localDocument.name,
    },
    images: contentResult.images,
    text: contentResult.text,
  });
  logAnalysisStep("ai_analysis", { documentId, localMode: true, model: aiResult.model });
  logAnalysisStep("schema_validation", { documentId, fields: Object.keys(aiResult.extraction.confidenceByField ?? {}).length, localMode: true });
  const now = new Date().toISOString();
  const extractionRecord: DocumentAiExtraction = {
    confidence: aiResult.extraction.confidenceByField ?? {},
    createdAt: now,
    documentId,
    documentType: aiResult.extraction.documentType ?? "bail",
    errorMessage: null,
    extractionMethod: contentResult.extractionMethod,
    id: createLocalExtractionId(),
    model: aiResult.model,
    pageCount: contentResult.pageCount,
    rawText: contentResult.text || buildVisionRawTextSummary(contentResult),
    status: "completed",
    structuredData: aiResult.extraction,
    analyzedAt: now,
    updatedAt: now,
  };

  logAnalysisStep("complete", { documentId, localMode: true });

  return NextResponse.json({ extractionRecord, status: "completed" });
}

async function getLatestCompletedExtraction(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from(extractionsTable)
    .select(selectExtractionExtendedColumns)
    .eq("document_id", documentId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    if (isMissingExtractionMetadataColumnError(error)) {
      logAnalysisError("cache_lookup", createDatabaseError("La migration des métadonnées d'analyse n'est pas appliquée sur Supabase distant.", error, "cache_lookup"));

      return getLatestCompletedExtractionBase(supabase, documentId);
    }

    logAnalysisError("cache_lookup", createDatabaseError("Impossible de vérifier les analyses existantes.", error, "cache_lookup"));
    return null;
  }

  if (!data?.[0]) {
    return null;
  }

  return fromSupabaseExtractionRow(data[0]);
}

async function getLatestCompletedExtractionBase(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from(extractionsTable)
    .select(selectExtractionBaseColumns)
    .eq("document_id", documentId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !data?.[0]) {
    if (error) {
      logAnalysisError("cache_lookup", createDatabaseError("Impossible de vérifier les analyses existantes.", error, "cache_lookup"));
    }

    return null;
  }

  return fromSupabaseExtractionRow(data[0]);
}

async function insertExtraction(
  supabase: SupabaseClient,
  input: {
    documentId: string;
    documentType: string;
    status: string;
    userId: string;
  },
) {
  const { data, error } = await supabase
    .from(extractionsTable)
    .insert({
      confidence: {},
      document_id: input.documentId,
      document_type: input.documentType,
      status: input.status,
      structured_data: {},
      user_id: input.userId,
    })
    .select(selectExtractionBaseColumns)
    .single();

  if (error || !data) {
    throw createDatabaseError("Impossible d'enregistrer l'analyse du document.", error, "database_insert");
  }

  return fromSupabaseExtractionRow(data);
}

async function updateExtraction(
  supabase: SupabaseClient,
  extractionId: string,
  input: {
    confidence: Record<string, number>;
    documentType: string | null;
    errorMessage: string | null;
    extractionMethod: DocumentAiExtractionMethod | null;
    model: string;
    pageCount: number | null;
    rawText: string | null;
    status: string;
    structuredData: LeaseExtraction;
  },
) {
  const analyzedAt = input.status === "completed" ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from(extractionsTable)
    .update({
      confidence: input.confidence,
      document_type: input.documentType,
      error_message: input.errorMessage,
      extraction_method: input.extractionMethod,
      model: input.model,
      page_count: input.pageCount,
      raw_text: input.rawText,
      status: input.status,
      structured_data: input.structuredData,
      analyzed_at: analyzedAt,
    })
    .eq("id", extractionId)
    .select(selectExtractionExtendedColumns)
    .single();

  if (error && isMissingExtractionMetadataColumnError(error)) {
    logAnalysisError("database_update", createDatabaseError("La migration des métadonnées d'analyse n'est pas appliquée sur Supabase distant.", error, "database_update"));

    return updateExtractionBase(supabase, extractionId, input, analyzedAt);
  }

  if (error || !data) {
    throw createDatabaseError("Impossible d'enregistrer le résultat d'analyse.", error, "database_update");
  }

  return fromSupabaseExtractionRow(data);
}

async function updateExtractionBase(
  supabase: SupabaseClient,
  extractionId: string,
  input: {
    confidence: Record<string, number>;
    documentType: string | null;
    errorMessage: string | null;
    extractionMethod: DocumentAiExtractionMethod | null;
    model: string;
    pageCount: number | null;
    rawText: string | null;
    status: string;
    structuredData: LeaseExtraction;
  },
  analyzedAt: string | null,
) {
  const { data, error } = await supabase
    .from(extractionsTable)
    .update({
      confidence: input.confidence,
      document_type: input.documentType,
      error_message: input.errorMessage,
      model: input.model,
      raw_text: input.rawText,
      status: input.status,
      structured_data: input.structuredData,
    })
    .eq("id", extractionId)
    .select(selectExtractionBaseColumns)
    .single();

  if (error || !data) {
    throw createDatabaseError("Impossible d'enregistrer le résultat d'analyse.", error, "database_update");
  }

  return {
    ...fromSupabaseExtractionRow(data),
    analyzedAt,
    extractionMethod: input.extractionMethod,
    pageCount: input.pageCount,
  };
}

function fromSupabaseDocumentRow(row: SupabaseDocumentRow): PropertyDocument {
  return {
    id: row.id,
    leaseId: row.lease_id,
    mimeType: row.mime_type ?? undefined,
    name: row.title || row.file_name || "Document",
    propertyId: row.property_id ?? "",
    relatedEntityId: row.related_entity_id ?? undefined,
    relatedEntityType: row.related_entity_type as PropertyDocument["relatedEntityType"],
    size: row.size_bytes ?? undefined,
    storagePath: row.storage_path ?? undefined,
    tenantId: row.tenant_id,
    type: row.document_type as PropertyDocument["type"],
    unitId: row.unit_id ?? "",
    uploadDate: row.uploaded_at.slice(0, 10),
    uploadedAt: row.uploaded_at,
  };
}

function fromSupabaseExtractionRow(row: SupabaseExtractionRow): DocumentAiExtraction {
  return {
    confidence: row.confidence ?? {},
    createdAt: row.created_at,
    documentId: row.document_id,
    documentType: row.document_type,
    errorMessage: row.error_message,
    extractionMethod: normalizeExtractionMethod(row.extraction_method),
    id: row.id,
    model: row.model,
    pageCount: row.page_count ?? null,
    rawText: row.raw_text,
    status: normalizeStatus(row.status),
    structuredData: row.structured_data ?? {},
    analyzedAt: row.analyzed_at ?? null,
    updatedAt: row.updated_at,
  };
}

function normalizeStatus(status: string): DocumentAiExtraction["status"] {
  if (status === "pending" || status === "processing" || status === "completed" || status === "failed") {
    return status;
  }

  return "failed";
}

function normalizeExtractionMethod(method: string | null | undefined): DocumentAiExtractionMethod | null {
  if (method === "native" || method === "ocr" || method === "vision") {
    return method;
  }

  return null;
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

  if (!match) {
    throw new Error("Format de fichier local invalide.");
  }

  const mimeType = match[1] || "application/octet-stream";
  const payload = match[3] || "";
  const buffer = match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");

  return { buffer, mimeType };
}

function createLocalExtractionId() {
  return `document-ai-${crypto.randomUUID()}`;
}

function getAdditionalImagePages(body: unknown): AdditionalImagePageInput[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { additionalImagePages?: unknown }).additionalImagePages)) {
    return [];
  }

  const pages: AdditionalImagePageInput[] = [];

  for (const page of (body as { additionalImagePages: unknown[] }).additionalImagePages) {
    if (!page || typeof page !== "object") {
      continue;
    }

    const source = page as Record<string, unknown>;

    if (typeof source.dataUrl === "string") {
      pages.push({
        dataUrl: source.dataUrl,
        fileName: typeof source.fileName === "string" ? source.fileName : null,
        mimeType: typeof source.mimeType === "string" ? source.mimeType : null,
      });
    }
  }

  return pages;
}

function buildVisionRawTextSummary(result: { images: { fileName?: string | null; pageNumber: number; qualityWarnings: string[] }[]; qualityWarnings: string[] }) {
  const pages = result.images.map((image) => `Page ${image.pageNumber}${image.fileName ? `: ${image.fileName}` : ""}`).join("\n");
  const warnings = result.qualityWarnings.length ? `\n\nAvertissements qualité:\n${result.qualityWarnings.join("\n")}` : "";

  return `Analyse visuelle du bail.\n${pages}${warnings}`;
}

function isSupabaseServerConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

async function getAuthenticatedSupabase(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ") || !isSupabaseServerConfigured()) {
    return null;
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await supabase.auth.getUser();

  return error || !data.user?.id ? null : { supabase, userId: data.user.id };
}

async function readJsonBody<T>(request: NextRequest, maxBytes: number): Promise<T | null> {
  const text = await request.text().catch(() => "");

  if (!text || new TextEncoder().encode(text).byteLength > maxBytes) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isRequestTooLarge(request: NextRequest, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function createAnalysisErrorResponse(error: HabixaAnalysisError) {
  return NextResponse.json(
    {
      code: error.code,
      details: getDevelopmentErrorDetails(error),
      error: getPublicAnalysisMessage(error),
      status: "failed",
    },
    { status: getHttpStatusForError(error.code) },
  );
}

function getHttpStatusForError(code: DocumentAnalysisErrorCode) {
  if (code === "UNAUTHORIZED") {
    return 401;
  }

  if (code === "DOCUMENT_NOT_FOUND") {
    return 404;
  }

  if (code === "AI_QUOTA_EXCEEDED" || code === "OPENAI_RATE_LIMIT") {
    return 429;
  }

  if (
    code === "DOCUMENT_FILE_MISSING" ||
    code === "PDF_INVALID" ||
    code === "PDF_READ_ERROR" ||
    code === "IMAGE_INVALID" ||
    code === "IMAGE_QUALITY_ERROR" ||
    code === "UNSUPPORTED_DOCUMENT" ||
    code === "OCR_NOT_CONFIGURED"
  ) {
    return 400;
  }

  return 500;
}

function createDatabaseError(message: string, cause: unknown, step: AnalysisStep) {
  return new HabixaAnalysisError("DATABASE_ERROR", message, {
    cause: sanitizeSupabaseError(cause),
    step,
  });
}

function sanitizeSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return sanitizeCause(error);
  }

  const source = error as Record<string, unknown>;

  return {
    code: source.code,
    details: source.details,
    hint: source.hint,
    message: source.message,
  };
}

function isMissingExtractionMetadataColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const source = error as Record<string, unknown>;
  const text = [source.code, source.details, source.hint, source.message].filter(Boolean).join(" ").toLowerCase();

  return (
    text.includes("extraction_method") ||
    text.includes("page_count") ||
    text.includes("analyzed_at") ||
    text.includes("document_ai_extractions")
  ) && (text.includes("column") || text.includes("schema cache") || text.includes("could not find"));
}

function logAnalysisStep(step: AnalysisStep, metadata: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    console.info("[Nexbail AI]", { step });
    return;
  }

  console.info("[Nexbail AI]", {
    step,
    ...metadata,
  });
}

function logAnalysisError(step: string, error: HabixaAnalysisError) {
  if (process.env.NODE_ENV === "production") {
    console.error("[Nexbail AI]", { code: error.code, step });
    return;
  }

  console.error("[Nexbail AI]", {
    cause: sanitizeCause(error.causeDetail),
    code: error.code,
    message: error.message,
    step,
  });
}

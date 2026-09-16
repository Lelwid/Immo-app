"use client";

import { shouldUseSupabase } from "@/lib/data/dataMode";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { DocumentAiExtraction, DocumentAiExtractionMethod, DocumentAiExtractionStatus, DocumentAnalysisErrorCode, LeaseExtraction, PropertyDocument } from "@/lib/types";

const table = "document_ai_extractions";
const localStorageKey = "habixa-document-ai-extractions-v1";

type SupabaseDocumentAiExtractionRow = {
  id: string;
  document_id: string;
  status: string;
  document_type: string | null;
  extraction_method?: string | null;
  page_count?: number | null;
  raw_text: string | null;
  structured_data: LeaseExtraction | null;
  confidence: Record<string, number> | null;
  model: string | null;
  error_message: string | null;
  analyzed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type AnalyzeOptions = {
  additionalImagePages?: File[];
  reanalyze?: boolean;
};

type AnalyzeResponse = {
  code?: DocumentAnalysisErrorCode;
  details?: {
    cause?: unknown;
    message?: string;
    step?: string;
  };
  error?: string;
  extractionRecord: DocumentAiExtraction;
  status: DocumentAiExtractionStatus;
};

export class DocumentAnalysisRequestError extends Error {
  code?: DocumentAnalysisErrorCode;
  details?: AnalyzeResponse["details"];

  constructor(message: string, options: { code?: DocumentAnalysisErrorCode; details?: AnalyzeResponse["details"] } = {}) {
    super(message);
    this.name = "DocumentAnalysisRequestError";
    this.code = options.code;
    this.details = options.details;
  }
}

const selectColumns =
  "id,document_id,status,document_type,extraction_method,page_count,raw_text,structured_data,confidence,model,error_message,analyzed_at,created_at,updated_at";
const selectBaseColumns =
  "id,document_id,status,document_type,raw_text,structured_data,confidence,model,error_message,created_at,updated_at";

export async function getLatestLeaseExtractionForDocument(documentId: string): Promise<DocumentAiExtraction | null> {
  if (canUseSupabase()) {
    const { data, error } = await supabase!
      .from(table)
      .select(selectColumns)
      .eq("document_id", documentId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      const fallback = await supabase!
        .from(table)
        .select(selectBaseColumns)
        .eq("document_id", documentId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1);

      return fallback.data?.[0] ? fromSupabaseRow(fallback.data[0]) : null;
    }

    return data?.[0] ? fromSupabaseRow(data[0]) : null;
  }

  return loadLocalExtractions()
    .filter((extraction) => extraction.documentId === documentId && extraction.status === "completed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export async function analyzeDocumentWithHabixaAi(document: PropertyDocument, options: AnalyzeOptions = {}): Promise<DocumentAiExtraction> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const localMode = !canUseSupabase();
  const additionalImagePages = options.additionalImagePages?.length ? await Promise.all(options.additionalImagePages.map(toAdditionalImagePagePayload)) : [];

  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase!.auth.getSession();
    const accessToken = data.session?.access_token;

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  const response = await fetch(`/api/documents/${document.id}/analyze`, {
    body: JSON.stringify({
      additionalImagePages,
      localDocument: localMode ? getLocalDocumentPayload(document) : undefined,
      reanalyze: Boolean(options.reanalyze || additionalImagePages.length),
    }),
    headers,
    method: "POST",
  });

  const payload = (await response.json().catch(() => null)) as Partial<AnalyzeResponse> | null;

  if (!response.ok || !payload?.extractionRecord) {
    throw new DocumentAnalysisRequestError(payload?.error || "Impossible d'analyser ce document. Vous pouvez continuer manuellement.", {
      code: payload?.code,
      details: payload?.details,
    });
  }

  const extractionRecord = normalizeExtractionRecord(payload.extractionRecord);

  if (localMode) {
    saveLocalExtraction(extractionRecord);
  }

  return extractionRecord;
}

function getLocalDocumentPayload(document: PropertyDocument) {
  return {
    fileDataUrl: document.fileDataUrl,
    id: document.id,
    mimeType: document.mimeType,
    name: document.name,
    propertyId: document.propertyId,
    storagePath: document.storagePath,
    tenantId: document.tenantId,
    type: document.type,
    unitId: document.unitId,
  };
}

async function toAdditionalImagePagePayload(file: File) {
  return {
    dataUrl: await readFileAsDataUrl(file),
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

function canUseSupabase() {
  return shouldUseSupabase() && isSupabaseConfigured && Boolean(supabase);
}

function fromSupabaseRow(row: SupabaseDocumentAiExtractionRow): DocumentAiExtraction {
  return normalizeExtractionRecord({
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
  });
}

function normalizeExtractionRecord(record: DocumentAiExtraction): DocumentAiExtraction {
  return {
    ...record,
    confidence: record.confidence ?? {},
    documentType: record.documentType ?? null,
    errorMessage: record.errorMessage ?? null,
    extractionMethod: record.extractionMethod ?? null,
    model: record.model ?? null,
    pageCount: record.pageCount ?? null,
    rawText: record.rawText ?? null,
    status: normalizeStatus(record.status),
    structuredData: record.structuredData ?? {},
    analyzedAt: record.analyzedAt ?? null,
  };
}

function normalizeStatus(status: string): DocumentAiExtractionStatus {
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

function loadLocalExtractions(): DocumentAiExtraction[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(localStorageKey) ?? "[]");

    return Array.isArray(parsed) ? parsed.map(normalizeExtractionRecord) : [];
  } catch {
    return [];
  }
}

function saveLocalExtraction(extraction: DocumentAiExtraction) {
  if (typeof window === "undefined") {
    return;
  }

  const existing = loadLocalExtractions();
  const next = existing.some((candidate) => candidate.id === extraction.id)
    ? existing.map((candidate) => (candidate.id === extraction.id ? extraction : candidate))
    : [extraction, ...existing];

  window.localStorage.setItem(localStorageKey, JSON.stringify(next));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

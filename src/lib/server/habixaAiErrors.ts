import "server-only";

import type { DocumentAnalysisErrorCode } from "@/lib/types";

export class HabixaAnalysisError extends Error {
  code: DocumentAnalysisErrorCode;
  causeDetail?: unknown;
  step?: string;

  constructor(code: DocumentAnalysisErrorCode, message: string, options: { cause?: unknown; step?: string } = {}) {
    super(message);
    this.name = "HabixaAnalysisError";
    this.code = code;
    this.causeDetail = options.cause;
    this.step = options.step;
  }
}

export function toHabixaAnalysisError(error: unknown, fallbackCode: DocumentAnalysisErrorCode = "AI_ANALYSIS_ERROR", step?: string) {
  if (error instanceof HabixaAnalysisError) {
    return step && !error.step ? new HabixaAnalysisError(error.code, error.message, { cause: error.causeDetail, step }) : error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new HabixaAnalysisError(fallbackCode, message || "Erreur d'analyse.", { cause: error, step });
}

export function getPublicAnalysisMessage(error: HabixaAnalysisError) {
  const development = process.env.NODE_ENV !== "production";

  if (development && error.code === "OPENAI_NOT_CONFIGURED") {
    return "Habixa AI n'est pas configuré. Vérifiez OPENAI_API_KEY.";
  }

  if (development && error.code === "AI_MODEL_NOT_CONFIGURED") {
    return "Habixa AI n'est pas configuré. Vérifiez HABIXA_AI_MODEL.";
  }

  const messages: Record<DocumentAnalysisErrorCode, string> = {
    AI_ANALYSIS_ERROR: "Habixa AI n'a pas pu analyser ce document.",
    AI_MODEL_NOT_CONFIGURED: "Habixa AI est temporairement indisponible.",
    AI_SCHEMA_ERROR: "Habixa AI n'a pas retourné un résultat exploitable.",
    DATABASE_ERROR: "Impossible d'enregistrer l'analyse du document.",
    DOCUMENT_FILE_MISSING: "Aucun fichier téléversé pour ce document.",
    DOCUMENT_NOT_FOUND: "Document introuvable ou inaccessible.",
    IMAGE_INVALID: "Format d'image non supporté. Utilisez JPG, PNG ou WebP.",
    IMAGE_QUALITY_ERROR: error.message || "Cette photo semble difficile à lire. Reprenez la photo en cadrant toute la page et avec un meilleur éclairage.",
    OCR_ERROR: "La reconnaissance du document a échoué. Réessayez dans quelques instants.",
    OCR_NOT_CONFIGURED: "Ce document semble être numérisé. Le service OCR n'est pas encore configuré.",
    OCR_REQUIRED: "Ce document semble être numérisé. Le service OCR est requis.",
    OPENAI_AUTH_ERROR: "Habixa AI est temporairement indisponible.",
    OPENAI_MODEL_ERROR: "Habixa AI est temporairement indisponible.",
    OPENAI_NOT_CONFIGURED: "Habixa AI est temporairement indisponible.",
    OPENAI_RATE_LIMIT: "Habixa AI est temporairement surchargé. Réessayez dans quelques instants.",
    PDF_INVALID: "Impossible de lire ce document.",
    PDF_READ_ERROR: "Impossible de lire ce document.",
    UNAUTHORIZED: "Session invalide.",
    UNSUPPORTED_DOCUMENT: "Seuls les documents de type Bail peuvent être analysés.",
  };

  return messages[error.code];
}

export function getDevelopmentErrorDetails(error: HabixaAnalysisError) {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return {
    cause: sanitizeCause(error.causeDetail),
    message: error.message,
    step: error.step,
  };
}

export function sanitizeCause(cause: unknown): unknown {
  if (!cause) {
    return undefined;
  }

  if (cause instanceof Error) {
    return {
      message: cause.message,
      name: cause.name,
    };
  }

  if (typeof cause !== "object") {
    return String(cause);
  }

  const source = cause as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !key.toLowerCase().includes("token") && !key.toLowerCase().includes("key") && key.toLowerCase() !== "authorization"),
  );
}

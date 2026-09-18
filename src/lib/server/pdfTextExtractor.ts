import "server-only";

import path from "node:path";
import { pathToFileURL } from "node:url";
import { getOCRProvider } from "@/lib/ocr";
import { HabixaAnalysisError } from "@/lib/server/habixaAiErrors";

export type PdfTextExtractionMethod = "native" | "ocr";

export type PdfTextExtractionResult = {
  extractionMethod: PdfTextExtractionMethod;
  pageCount: number;
  requiresOcr: boolean;
  text: string;
};

const minimumUsefulTextLength = 120;
const minimumTextPerPage = 60;
const maxPdfSizeBytes = 25 * 1024 * 1024;
let pdfWorkerConfigured = false;
let pdfParseConstructorPromise: Promise<PdfParseConstructor> | null = null;

type PdfParseConstructor = (typeof import("pdf-parse"))["PDFParse"];

export async function extractPdfText(file: Buffer, options: { fileName?: string | null; mimeType?: string | null } = {}): Promise<PdfTextExtractionResult> {
  if (!isPdf(options.mimeType, options.fileName, file)) {
    throw new HabixaAnalysisError("PDF_INVALID", "Impossible de lire ce document.", { step: "pdf_validation" });
  }

  if (file.byteLength > maxPdfSizeBytes) {
    throw new HabixaAnalysisError("PDF_READ_ERROR", "Ce PDF est trop volumineux pour être analysé.", { step: "pdf_validation" });
  }

  const nativeResult = await extractNativePdfText(file);
  const requiresOcr = shouldRequireOcr(nativeResult.text, nativeResult.pageCount);

  if (!requiresOcr) {
    return {
      extractionMethod: "native",
      pageCount: nativeResult.pageCount,
      requiresOcr: false,
      text: nativeResult.text,
    };
  }

  const ocrProvider = getOCRProvider();

  if (!ocrProvider) {
    throw new HabixaAnalysisError("OCR_NOT_CONFIGURED", "Ce document semble être numérisé. Le service OCR n'est pas configuré.", { step: "ocr_configuration" });
  }

  const ocrResult = await ocrProvider.extractText({
    file,
    fileName: options.fileName,
    mimeType: options.mimeType,
  });

  return {
    extractionMethod: "ocr",
    pageCount: ocrResult.pageCount ?? nativeResult.pageCount,
    requiresOcr: true,
    text: normalizeExtractedText(ocrResult.text),
  };
}

async function extractNativePdfText(file: Buffer) {
  const PDFParse = await loadPdfParse();
  configurePdfWorker(PDFParse);

  const parser = new PDFParse({ data: file });

  try {
    const textResult = await parser.getText();
    const pageCount = typeof textResult.total === "number" ? textResult.total : estimatePageCount(file);

    return {
      pageCount: Math.max(1, pageCount),
      text: normalizeExtractedText(textResult.text || ""),
    };
  } catch (error) {
    if (error instanceof HabixaAnalysisError) {
      throw error;
    }

    throw new HabixaAnalysisError("PDF_READ_ERROR", "Impossible de lire ce document.", { cause: error, step: "pdf_parse" });
  } finally {
    await parser.destroy();
  }
}

async function loadPdfParse() {
  if (!pdfParseConstructorPromise) {
    pdfParseConstructorPromise = (async () => {
      const canvas = await import("@napi-rs/canvas");
      const globals = globalThis as unknown as Record<"DOMMatrix" | "ImageData" | "Path2D", unknown>;

      globals.DOMMatrix ??= canvas.DOMMatrix;
      globals.ImageData ??= canvas.ImageData;
      globals.Path2D ??= canvas.Path2D;

      const pdfParse = await import("pdf-parse");
      return pdfParse.PDFParse;
    })();
  }

  return pdfParseConstructorPromise;
}

function configurePdfWorker(PDFParse: PdfParseConstructor) {
  if (pdfWorkerConfigured) {
    return;
  }

  const workerPath = path.join(process.cwd(), "node_modules", "pdf-parse", "dist", "pdf-parse", "esm", "pdf.worker.mjs");
  PDFParse.setWorker(pathToFileURL(workerPath).href);
  pdfWorkerConfigured = true;
}

function shouldRequireOcr(text: string, pageCount: number) {
  const normalized = normalizeExtractedText(text);
  const usefulCharacters = normalized.replace(/\s/g, "").length;
  const textPerPage = usefulCharacters / Math.max(1, pageCount);
  const alphabeticCharacters = (normalized.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const alphabeticRatio = usefulCharacters > 0 ? alphabeticCharacters / usefulCharacters : 0;

  return usefulCharacters < minimumUsefulTextLength || textPerPage < minimumTextPerPage || alphabeticRatio < 0.45;
}

function isPdf(mimeType: string | null | undefined, fileName: string | null | undefined, file: Buffer) {
  const hasPdfMime = mimeType === "application/pdf";
  const hasPdfExtension = Boolean(fileName?.toLowerCase().endsWith(".pdf"));
  const hasPdfMagicBytes = file.subarray(0, 4).toString("ascii") === "%PDF";

  return hasPdfMime || hasPdfExtension || hasPdfMagicBytes;
}

function estimatePageCount(file: Buffer) {
  const text = file.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/g);

  return matches?.length || 1;
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

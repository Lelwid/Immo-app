import "server-only";

import type { OCRInput, OCRProvider, OCRResult } from "@/lib/ocr/types";
import { HabixaAnalysisError } from "@/lib/server/habixaAiErrors";

const ocrTimeoutMs = 60_000;

export function getOCRProvider(): OCRProvider | null {
  const provider = getConfiguredProviderName();

  if (!provider || provider === "none") {
    return null;
  }

  if (provider === "http" || provider === "generic-http") {
    return new GenericHttpOCRProvider();
  }

  return null;
}

function getConfiguredProviderName() {
  return (process.env.OCR_PROVIDER || process.env.HABIXA_OCR_PROVIDER || "").trim().toLowerCase();
}

class GenericHttpOCRProvider implements OCRProvider {
  async extractText(input: OCRInput): Promise<OCRResult> {
    const endpoint = process.env.OCR_ENDPOINT || process.env.HABIXA_OCR_ENDPOINT;

    if (!endpoint) {
      throw new HabixaAnalysisError("OCR_NOT_CONFIGURED", "Ce document semble être numérisé. Le service OCR n'est pas configuré.", { step: "ocr_configuration" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ocrTimeoutMs);
    const form = new FormData();
    const fileName = input.fileName || "document.pdf";
    const mimeType = input.mimeType || "application/pdf";
    const fileBytes = new Uint8Array(input.file.buffer.slice(input.file.byteOffset, input.file.byteOffset + input.file.byteLength) as ArrayBuffer);

    form.set("file", new Blob([fileBytes], { type: mimeType }), fileName);

    try {
      const response = await fetch(endpoint, {
        body: form,
        headers: buildOcrHeaders(),
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new HabixaAnalysisError("OCR_ERROR", "La reconnaissance du document a échoué. Réessayez dans quelques instants.", {
          cause: {
            provider: getConfiguredProviderName() || "generic-http",
            status: response.status,
          },
          step: "ocr_request",
        });
      }

      const payload = await response.json();
      const text = extractTextFromProviderPayload(payload);

      if (!text) {
        throw new HabixaAnalysisError("OCR_ERROR", "La reconnaissance du document a échoué. Réessayez dans quelques instants.", { step: "ocr_response" });
      }

      return {
        pageCount: extractPageCountFromProviderPayload(payload),
        provider: getConfiguredProviderName() || "generic-http",
        text: normalizeText(text),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new HabixaAnalysisError("OCR_ERROR", "La reconnaissance du document a dépassé le délai permis.", { cause: error, step: "ocr_timeout" });
      }

      if (error instanceof HabixaAnalysisError) {
        throw error;
      }

      throw new HabixaAnalysisError("OCR_ERROR", "La reconnaissance du document a échoué. Réessayez dans quelques instants.", { cause: error, step: "ocr_request" });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildOcrHeaders() {
  const apiKey = process.env.OCR_API_KEY || process.env.HABIXA_OCR_API_KEY;

  if (!apiKey) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function extractTextFromProviderPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return "";
  }

  if (typeof payload.text === "string") {
    return payload.text;
  }

  if (typeof payload.fullText === "string") {
    return payload.fullText;
  }

  if (Array.isArray(payload.pages)) {
    return payload.pages
      .map((page) => (isRecord(page) && typeof page.text === "string" ? page.text : ""))
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

function extractPageCountFromProviderPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.pageCount === "number") {
    return payload.pageCount;
  }

  if (Array.isArray(payload.pages)) {
    return payload.pages.length;
  }

  return null;
}

function normalizeText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

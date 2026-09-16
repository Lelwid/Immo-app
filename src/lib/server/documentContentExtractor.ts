import "server-only";

import { extractPdfText } from "@/lib/server/pdfTextExtractor";
import { HabixaAnalysisError } from "@/lib/server/habixaAiErrors";
import type { DocumentAiExtractionMethod } from "@/lib/types";

export type DocumentImagePage = {
  dataUrl: string;
  fileName?: string | null;
  height?: number | null;
  mimeType: SupportedImageMimeType;
  pageNumber: number;
  qualityWarnings: string[];
  sizeBytes: number;
  width?: number | null;
};

export type DocumentContentExtractionResult = {
  extractionMethod: DocumentAiExtractionMethod;
  images: DocumentImagePage[];
  pageCount: number;
  qualityWarnings: string[];
  requiresOcr: boolean;
  text: string;
};

export type DocumentBinaryInput = {
  file: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
};

export type AdditionalImagePageInput = {
  dataUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
};

type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

const maxImagePages = 8;
const maxImageBytes = 12 * 1024 * 1024;
const minReadableDimension = 600;
const minReadableBytes = 2 * 1024;

export async function extractDocumentContent(
  primary: DocumentBinaryInput,
  options: { additionalImagePages?: AdditionalImagePageInput[] } = {},
): Promise<DocumentContentExtractionResult> {
  const additionalImages = normalizeAdditionalImagePages(options.additionalImagePages ?? []);

  if (isSupportedImage(primary.mimeType, primary.fileName, primary.file)) {
    const images = [
      createImagePage(primary.file, {
        fileName: primary.fileName,
        mimeType: primary.mimeType,
        pageNumber: 1,
      }),
      ...additionalImages.map((image, index) =>
        createImagePage(image.buffer, {
          fileName: image.fileName,
          mimeType: image.mimeType,
          pageNumber: index + 2,
        }),
      ),
    ];

    return createVisionResult(images);
  }

  if (looksLikeUnsupportedImage(primary.mimeType, primary.fileName)) {
    throw new HabixaAnalysisError("IMAGE_INVALID", "Format d'image non supporté. Utilisez JPG, PNG ou WebP.", { step: "image_validation" });
  }

  const pdfResult = await extractPdfText(primary.file, {
    fileName: primary.fileName,
    mimeType: primary.mimeType,
  });
  const additionalPages = additionalImages.map((image, index) =>
    createImagePage(image.buffer, {
      fileName: image.fileName,
      mimeType: image.mimeType,
      pageNumber: pdfResult.pageCount + index + 1,
    }),
  );

  if (additionalPages.length > 0) {
    return {
      extractionMethod: "vision",
      images: additionalPages,
      pageCount: pdfResult.pageCount + additionalPages.length,
      qualityWarnings: additionalPages.flatMap((page) => page.qualityWarnings.map((warning) => `Page ${page.pageNumber}: ${warning}`)),
      requiresOcr: false,
      text: pdfResult.text,
    };
  }

  return {
    extractionMethod: pdfResult.extractionMethod,
    images: [],
    pageCount: pdfResult.pageCount,
    qualityWarnings: [],
    requiresOcr: pdfResult.requiresOcr,
    text: pdfResult.text,
  };
}

function createVisionResult(images: DocumentImagePage[]): DocumentContentExtractionResult {
  const blockingWarning = images.find((image) => isBlockingQualityWarning(image.qualityWarnings));

  if (blockingWarning) {
    throw new HabixaAnalysisError(
      "IMAGE_QUALITY_ERROR",
      `Page ${blockingWarning.pageNumber} difficile à lire. Reprenez la photo en cadrant toute la page et avec un meilleur éclairage.`,
      {
        cause: {
          height: blockingWarning.height,
          pageNumber: blockingWarning.pageNumber,
          sizeBytes: blockingWarning.sizeBytes,
          warnings: blockingWarning.qualityWarnings,
          width: blockingWarning.width,
        },
        step: "image_quality",
      },
    );
  }

  return {
    extractionMethod: "vision",
    images,
    pageCount: images.length,
    qualityWarnings: images.flatMap((page) => page.qualityWarnings.map((warning) => `Page ${page.pageNumber}: ${warning}`)),
    requiresOcr: true,
    text: "",
  };
}

function normalizeAdditionalImagePages(pages: AdditionalImagePageInput[]) {
  if (pages.length > maxImagePages) {
    throw new HabixaAnalysisError("IMAGE_INVALID", `Limite de ${maxImagePages} pages photo dépassée.`, { step: "image_validation" });
  }

  return pages.map((page, index) => {
    const decoded = decodeDataUrl(page.dataUrl);

    if (!isSupportedImage(decoded.mimeType || page.mimeType, page.fileName, decoded.buffer)) {
      throw new HabixaAnalysisError("IMAGE_INVALID", `Page ${index + 2}: format d'image non supporté.`, { step: "image_validation" });
    }

    return {
      buffer: decoded.buffer,
      fileName: page.fileName,
      mimeType: normalizeImageMimeType(decoded.mimeType || page.mimeType, page.fileName, decoded.buffer),
    };
  });
}

function createImagePage(file: Buffer, options: { fileName?: string | null; mimeType?: string | null; pageNumber: number }): DocumentImagePage {
  const mimeType = normalizeImageMimeType(options.mimeType, options.fileName, file);

  if (!mimeType) {
    throw new HabixaAnalysisError("IMAGE_INVALID", "Format d'image non supporté.", { step: "image_validation" });
  }

  if (file.byteLength > maxImageBytes) {
    throw new HabixaAnalysisError("IMAGE_INVALID", "Cette image est trop volumineuse pour être analysée.", { step: "image_validation" });
  }

  const dimensions = getImageDimensions(file, mimeType);
  const qualityWarnings = getImageQualityWarnings(file, dimensions);

  return {
    dataUrl: `data:${mimeType};base64,${file.toString("base64")}`,
    fileName: options.fileName,
    height: dimensions?.height ?? null,
    mimeType,
    pageNumber: options.pageNumber,
    qualityWarnings,
    sizeBytes: file.byteLength,
    width: dimensions?.width ?? null,
  };
}

function getImageQualityWarnings(file: Buffer, dimensions: { height: number; width: number } | null) {
  const warnings: string[] = [];

  if (file.byteLength < minReadableBytes) {
    warnings.push("image presque vide ou trop compressée");
  }

  if (dimensions && (dimensions.width < minReadableDimension || dimensions.height < minReadableDimension)) {
    warnings.push("résolution trop faible");
  }

  return warnings;
}

function isBlockingQualityWarning(warnings: string[]) {
  return warnings.includes("image presque vide ou trop compressée") || warnings.includes("résolution trop faible");
}

function isSupportedImage(mimeType: string | null | undefined, fileName: string | null | undefined, file: Buffer) {
  return Boolean(normalizeImageMimeType(mimeType, fileName, file));
}

function looksLikeUnsupportedImage(mimeType: string | null | undefined, fileName: string | null | undefined) {
  const normalizedMime = mimeType?.toLowerCase() ?? "";
  const normalizedName = fileName?.toLowerCase() ?? "";

  return normalizedMime.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|tif|tiff)$/i.test(normalizedName);
}

function normalizeImageMimeType(mimeType: string | null | undefined, fileName: string | null | undefined, file: Buffer): SupportedImageMimeType | null {
  const normalizedMime = mimeType?.toLowerCase();
  const normalizedName = fileName?.toLowerCase() ?? "";

  if (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg" || normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg") || isJpeg(file)) {
    return "image/jpeg";
  }

  if (normalizedMime === "image/png" || normalizedName.endsWith(".png") || isPng(file)) {
    return "image/png";
  }

  if (normalizedMime === "image/webp" || normalizedName.endsWith(".webp") || isWebp(file)) {
    return "image/webp";
  }

  return null;
}

function getImageDimensions(file: Buffer, mimeType: SupportedImageMimeType) {
  if (mimeType === "image/png") {
    return getPngDimensions(file);
  }

  if (mimeType === "image/jpeg") {
    return getJpegDimensions(file);
  }

  return getWebpDimensions(file);
}

function getPngDimensions(file: Buffer) {
  if (!isPng(file) || file.byteLength < 24) {
    return null;
  }

  return {
    height: file.readUInt32BE(20),
    width: file.readUInt32BE(16),
  };
}

function getJpegDimensions(file: Buffer) {
  if (!isJpeg(file)) {
    return null;
  }

  let offset = 2;

  while (offset < file.byteLength - 9) {
    if (file[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = file[offset + 1];
    const length = file.readUInt16BE(offset + 2);

    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        height: file.readUInt16BE(offset + 5),
        width: file.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function getWebpDimensions(file: Buffer) {
  if (!isWebp(file) || file.byteLength < 30) {
    return null;
  }

  const format = file.subarray(12, 16).toString("ascii");

  if (format === "VP8X" && file.byteLength >= 30) {
    return {
      height: 1 + file.readUIntLE(27, 3),
      width: 1 + file.readUIntLE(24, 3),
    };
  }

  if (format === "VP8 " && file.byteLength >= 30) {
    return {
      height: file.readUInt16LE(28) & 0x3fff,
      width: file.readUInt16LE(26) & 0x3fff,
    };
  }

  if (format === "VP8L" && file.byteLength >= 25) {
    const bits = file.readUInt32LE(21);

    return {
      height: 1 + ((bits >> 14) & 0x3fff),
      width: 1 + (bits & 0x3fff),
    };
  }

  return null;
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

  if (!match) {
    throw new HabixaAnalysisError("IMAGE_INVALID", "Format d'image invalide.", { step: "image_validation" });
  }

  return {
    buffer: match[2] ? Buffer.from(match[3] || "", "base64") : Buffer.from(decodeURIComponent(match[3] || ""), "utf8"),
    mimeType: match[1] || null,
  };
}

function isJpeg(file: Buffer) {
  return file.byteLength >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
}

function isPng(file: Buffer) {
  return file.byteLength >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isWebp(file: Buffer) {
  return file.byteLength >= 12 && file.subarray(0, 4).toString("ascii") === "RIFF" && file.subarray(8, 12).toString("ascii") === "WEBP";
}

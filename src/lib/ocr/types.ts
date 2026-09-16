import "server-only";

export type OCRInput = {
  file: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
};

export type OCRResult = {
  provider: string;
  text: string;
  pageCount?: number | null;
};

export interface OCRProvider {
  extractText(input: OCRInput): Promise<OCRResult>;
}

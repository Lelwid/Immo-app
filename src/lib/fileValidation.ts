const mebibyte = 1024 * 1024;

export const maxDocumentFileBytes = 20 * mebibyte;
export const maxMaintenanceImageBytes = 10 * mebibyte;

const documentMimeTypes = new Set([
  "application/msword",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const maintenanceImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const documentExtensions = new Set(["doc", "docx", "jpeg", "jpg", "pdf", "png", "webp"]);
const maintenanceImageExtensions = new Set(["jpeg", "jpg", "png", "webp"]);

export const documentFileAccept = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp";
export const maintenanceImageAccept = ".jpg,.jpeg,.png,.webp";

export function validateDocumentFile(file: File): string | null {
  if (file.size <= 0 || file.size > maxDocumentFileBytes) {
    return "Le fichier doit peser au plus 20 Mo.";
  }

  if (!matchesAllowedType(file, documentMimeTypes, documentExtensions)) {
    return "Format non accepté. Utilisez PDF, Word, JPG, PNG ou WebP.";
  }

  return null;
}

export function validateMaintenanceImages(files: File[]): string | null {
  if (files.length > 5) {
    return "Ajoutez au maximum 5 photos.";
  }

  for (const file of files) {
    if (file.size <= 0 || file.size > maxMaintenanceImageBytes) {
      return "Chaque photo doit peser au plus 10 Mo.";
    }

    if (!matchesAllowedType(file, maintenanceImageMimeTypes, maintenanceImageExtensions)) {
      return "Format non accepté. Utilisez JPG, PNG ou WebP.";
    }
  }

  return null;
}

function matchesAllowedType(file: File, mimeTypes: Set<string>, extensions: Set<string>) {
  if (file.type) {
    return mimeTypes.has(file.type.toLowerCase());
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && extensions.has(extension));
}

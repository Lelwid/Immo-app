"use client";

import { useState } from "react";
import {
  getDocumentDownloadUrl,
  getDocumentPreviewUrl,
  hasDocumentFile,
} from "@/lib/data/documentsService";
import type { PropertyDocument } from "@/lib/types";

export function DocumentFileActions({
  document,
  onDownload,
}: {
  document: PropertyDocument;
  onDownload?: (document: PropertyDocument) => void;
}) {
  const [loadingAction, setLoadingAction] = useState<"preview" | "download" | null>(null);

  if (!hasDocumentFile(document)) {
    return (
      <span className="rounded-md border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">
        Aucun fichier téléversé
      </span>
    );
  }

  if (false && !hasDocumentFile(document)) {
    return (
      <span className="rounded-md border border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">
        Métadonnées
      </span>
    );
  }

  async function openPreview() {
    setLoadingAction("preview");

    try {
      const url = await getDocumentPreviewUrl(document);

      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        onDownload?.(document);
      }
    } catch (error) {
      console.error("Impossible d'ouvrir l'aperçu du document.", error);
    } finally {
      setLoadingAction(null);
    }
  }

  async function downloadFile() {
    setLoadingAction("download");

    try {
      const url = await getDocumentDownloadUrl(document);

      if (url) {
        const link = window.document.createElement("a");
        link.href = url;
        link.download = document.name;
        link.rel = "noreferrer";
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        onDownload?.(document);
      }
    } catch (error) {
      console.error("Impossible de télécharger le document.", error);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <>
      <button className="btn-secondary" disabled={loadingAction !== null} onClick={openPreview} type="button">
        {loadingAction === "preview" ? "Ouverture..." : "Aperçu"}
      </button>
      <button className="btn-secondary" disabled={loadingAction !== null} onClick={downloadFile} type="button">
        {loadingAction === "download" ? "Téléchargement..." : "Télécharger"}
      </button>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { DocumentFileActions } from "@/components/DocumentFileActions";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { createDocumentWithFile, deleteDocument as deleteDocumentRecord, getDocumentPreviewUrl, hasDocumentFile } from "@/lib/data/documentsService";
import { documentTypeLabel, getPropertyName, getUnitLabel } from "@/lib/mockData";
import type { DocumentRelatedEntityType, DocumentType, LocalStore, PropertyDocument, UnitActivity } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type DocumentFilter = "tous" | DocumentType;
type DocumentForm = Pick<PropertyDocument, "name" | "type" | "propertyId" | "unitId" | "relatedEntityType" | "relatedEntityId">;
type DocumentDrawerTab = "apercu" | "informations" | "historique";
type DocumentUploadContext = {
  initialLeaseId?: string | null;
  initialRelatedEntityId?: string | null;
  initialRelatedEntityType?: DocumentRelatedEntityType;
  initialTenantId?: string | null;
  initialType?: DocumentType;
  initialUnitId?: string | null;
  propertyId?: string;
  title?: string;
};

const filters: { label: string; value: DocumentFilter }[] = [
  { label: "Tous", value: "tous" },
  { label: "Baux", value: "bail" },
  { label: "Avis", value: "avis" },
  { label: "Reçus", value: "recu" },
  { label: "Factures", value: "facture" },
  { label: "Photos", value: "photo" },
  { label: "Inspections", value: "inspection" },
  { label: "Assurances", value: "assurance" },
  { label: "Paiements", value: "paiement" },
  { label: "Autres", value: "autre" },
];

const relatedEntityTypeLabel: Record<DocumentRelatedEntityType, string> = {
  immeuble: "Immeuble",
  logement: "Logement",
  locataire: "Locataire",
  bail: "Bail",
  entretien: "Demande d'entretien",
  paiement: "Paiement",
};

const documentIcon: Record<DocumentType, string> = {
  bail: "B",
  avis: "A",
  recu: "R",
  facture: "F",
  photo: "P",
  inspection: "I",
  assurance: "A",
  paiement: "$",
  autre: "...",
};

const documentStyle: Record<DocumentType, string> = {
  bail: "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  avis: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  recu: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  facture: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  photo: "border-[var(--border)] bg-[var(--surface-3)] text-[var(--foreground)]",
  inspection: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  assurance: "border-[color:var(--red)]/30 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  paiement: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  autre: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};

export default function DocumentsPage() {
  const { setStore } = useLocalStore();
  const { data, loading: snapshotLoading, error: snapshotError, refresh: refreshPortfolioSnapshot } = usePortfolioSnapshot();
  const snapshotStore = data ?? emptyPortfolioStore;
  const [activeFilter, setActiveFilter] = useState<DocumentFilter>("tous");
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentUploadContext, setDocumentUploadContext] = useState<DocumentUploadContext | null>(getInitialUploadContextFromUrl);
  const [documentForm, setDocumentForm] = useState<DocumentForm>(() => createEmptyDocument(snapshotStore));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState(getInitialDocumentId);
  const [documentDrawerTab, setDocumentDrawerTab] = useState<DocumentDrawerTab>("apercu");
  const [documentToDelete, setDocumentToDelete] = useState<PropertyDocument | null>(null);
  const documentModalOpen = showDocumentModal || Boolean(documentUploadContext);
  const documents = useMemo(
    () =>
      snapshotStore.documents
        .filter((document) => activeFilter === "tous" || document.type === activeFilter)
        .sort((a, b) => (b.uploadedAt ?? b.uploadDate).localeCompare(a.uploadedAt ?? a.uploadDate)),
    [activeFilter, snapshotStore.documents],
  );
  const relatedOptions = useMemo(
    () => getRelatedEntityOptions(snapshotStore, documentForm.relatedEntityType ?? "logement"),
    [documentForm.relatedEntityType, snapshotStore],
  );
  const selectedDocument = snapshotStore.documents.find((document) => document.id === selectedDocumentId) ?? null;

  if (!data) {
    return (
      <RouteShell title="Documents" description="Centralisez les baux, factures, photos, inspections, assurances et preuves de paiement.">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-semibold text-[var(--muted)]">
            {snapshotLoading ? "Chargement des documents..." : "Impossible de charger les données du portefeuille."}
          </p>
          {snapshotError ? <p className="mt-2 text-sm text-[color:var(--yellow)]">{snapshotError}</p> : null}
          {snapshotError ? (
            <button className="btn-secondary mt-4" onClick={() => void refreshPortfolioSnapshot()} type="button">
              Réessayer
            </button>
          ) : null}
        </section>
      </RouteShell>
    );
  }

  async function refreshDocumentsSnapshot() {
    try {
      await refreshPortfolioSnapshot();
    } catch (error) {
      console.error("Impossible de rafraîchir les documents.", error);
      void error;
    }
  }

  function openDocumentModal() {
    setDocumentUploadContext(null);
    setShowDocumentModal(true);
  }

  function closeDocumentModal() {
    setShowDocumentModal(false);
    setDocumentUploadContext(null);
    clearDocumentUploadQuery();
  }

  async function handleDocumentUploaded({ activity, document }: { activity: UnitActivity | null; document: PropertyDocument }) {
    setStore((current) => ({
      ...current,
      documents: upsertDocumentInStore(current.documents, document),
    }));

    if (activity) {
      setStore((current) => addActivityToStore(current, activity));
    }

    await refreshDocumentsSnapshot();
    closeDocumentModal();
  }

  async function submitDocument() {
    if (!selectedFile || !documentForm.name.trim() || !documentForm.propertyId || !documentForm.relatedEntityId) {
      return;
    }

    const now = new Date().toISOString();
    try {
      const document = await createDocumentWithFile(
        {
          ...documentForm,
          uploadDate: now.slice(0, 10),
          uploadedAt: now,
        },
        selectedFile,
      );

      setStore((current) => ({
        ...current,
        documents: upsertDocumentInStore(current.documents, document),
      }));

      const activity = await createActivityRecord({
        propertyId: document.propertyId,
        unitId: document.unitId,
        type: "document",
        title: "Document téléversé",
        description: `${document.name} a été téléversé dans la bibliothèque documentaire.`,
        date: document.uploadDate,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshDocumentsSnapshot();
    } catch (error) {
      console.error("Impossible de créer le document ou son activité.", error);
    }
    setShowDocumentModal(false);
  }

  async function deleteDocument(document: PropertyDocument) {
    try {
      await deleteDocumentRecord(document.id);

      setStore((current) => ({
        ...current,
        documents: current.documents.filter((candidate) => candidate.id !== document.id),
      }));

      const activity = await createActivityRecord({
        propertyId: document.propertyId,
        unitId: document.unitId,
        type: "document",
        title: "Document supprimé",
        description: `${document.name} a été supprimé de la bibliothèque documentaire.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshDocumentsSnapshot();
    } catch (error) {
      console.error("Impossible de supprimer le document ou de créer son activité.", error);
    }
    setDocumentToDelete(null);
    if (selectedDocumentId === document.id) {
      setSelectedDocumentId(null);
    }
  }

  function openDocumentDrawer(document: PropertyDocument) {
    setSelectedDocumentId(document.id);
    setDocumentDrawerTab("apercu");
  }

  async function trackDocumentDownload(document: PropertyDocument) {
    try {
      const activity = await createActivityRecord({
        propertyId: document.propertyId,
        unitId: document.unitId,
        type: "document",
        title: "Document téléchargé",
        description: `${document.name} a été téléchargé.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshDocumentsSnapshot();
    } catch (error) {
      console.error("Impossible de créer l'activité du document.", error);
    }
  }

  return (
    <RouteShell
      title="Documents"
      description="Bibliothèque documentaire des immeubles, logements, baux, factures, photos, inspections et assurances."
    >
      <section className="grid gap-5">
        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {filters.map((filter) => {
            const active = activeFilter === filter.value;

            return (
              <button
                key={filter.value}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-col gap-2 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">Liste des documents</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{documents.length} documents affichés</p>
              {snapshotLoading ? <p className="mt-1 text-xs font-semibold uppercase text-[var(--muted)]">Synchronisation des documents...</p> : null}
              {snapshotError ? <p className="mt-1 text-sm font-semibold text-[color:var(--yellow)]">{snapshotError}</p> : null}
            </div>
            <button className="btn-primary" onClick={openDocumentModal} type="button">
              Ajouter un document
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {documents.map((document) => (
              <article
                key={document.id}
                aria-label={`Ouvrir le document: ${document.name}`}
                role="button"
                tabIndex={0}
                onClick={() => openDocumentDrawer(document)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openDocumentDrawer(document);
                  }
                }}
                className="group grid cursor-pointer gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] md:grid-cols-[minmax(260px,1.4fr)_1fr_1fr_0.8fr_auto]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${documentStyle[document.type]}`}
                  >
                    {documentIcon[document.type]}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-[var(--foreground)] transition group-hover:text-[color:var(--accent)]">{document.name}</h3>
                    <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${documentStyle[document.type]}`}>
                      {documentTypeLabel[document.type]}
                    </span>
                  </div>
                </div>

                <Info label="Immeuble" value={getPropertyName(document.propertyId, snapshotStore)} />
                <Info label="Logement" value={getUnitLabel(document.unitId, snapshotStore)} />
                <Info label="Téléversement" value={formatDate(document.uploadDate)} />
                <div className="flex flex-wrap gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
                  <DocumentFileActions document={document} onDownload={trackDocumentDownload} />
                  <button className="btn-danger self-start" onClick={() => setDocumentToDelete(document)} type="button">
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {documentModalOpen ? (
        <DocumentUploadModal
          initialLeaseId={documentUploadContext?.initialLeaseId}
          initialRelatedEntityId={documentUploadContext?.initialRelatedEntityId}
          initialRelatedEntityType={documentUploadContext?.initialRelatedEntityType}
          initialTenantId={documentUploadContext?.initialTenantId}
          initialType={documentUploadContext?.initialType ?? (activeFilter === "tous" ? undefined : activeFilter)}
          initialUnitId={documentUploadContext?.initialUnitId}
          onCancel={closeDocumentModal}
          onUploaded={handleDocumentUploaded}
          propertyId={documentUploadContext?.propertyId}
          store={snapshotStore}
          title={documentUploadContext?.title}
        />
      ) : null}

      {false && showDocumentModal ? (
        <FormModal title="Ajouter un document" onCancel={() => setShowDocumentModal(false)}>
          <div className="grid gap-3">
            <TextInput
              label="Nom du document"
              value={documentForm.name}
              onChange={(name) => setDocumentForm({ ...documentForm, name })}
            />
            <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
              Fichier
              <input
                className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  if (file && !documentForm.name.trim()) {
                    setDocumentForm({ ...documentForm, name: file.name });
                  }
                }}
              />
            </label>
            <SelectInput
              label="Type"
              value={documentForm.type}
              onChange={(type) => setDocumentForm({ ...documentForm, type: type as DocumentType })}
              options={Object.entries(documentTypeLabel)}
            />
            <SelectInput
              label="Attacher à"
              value={documentForm.relatedEntityType ?? "logement"}
              onChange={(relatedEntityType) => {
                const nextType = relatedEntityType as DocumentRelatedEntityType;
                const firstOption = getRelatedEntityOptions(snapshotStore, nextType)[0];
                setDocumentForm({
                  ...documentForm,
                  relatedEntityType: nextType,
                  relatedEntityId: firstOption?.value ?? "",
                  propertyId: firstOption?.propertyId ?? snapshotStore.properties[0]?.id ?? "",
                  unitId: firstOption?.unitId ?? "",
                });
              }}
              options={Object.entries(relatedEntityTypeLabel)}
            />
            <SelectInput
              label="Élément lié"
              value={documentForm.relatedEntityId ?? ""}
              onChange={(relatedEntityId) => {
                const option = relatedOptions.find((candidate) => candidate.value === relatedEntityId);
                setDocumentForm({
                  ...documentForm,
                  relatedEntityId,
                  propertyId: option?.propertyId ?? documentForm.propertyId,
                  unitId: option?.unitId ?? documentForm.unitId,
                });
              }}
              options={relatedOptions.map((option) => [option.value, option.label])}
            />
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="btn-secondary" onClick={() => setShowDocumentModal(false)} type="button">
                Annuler
              </button>
              <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedFile} onClick={submitDocument} type="button">
                Téléverser
              </button>
            </div>
          </div>
        </FormModal>
      ) : null}

      {selectedDocument ? (
        <DocumentDrawer
          activeTab={documentDrawerTab}
          document={selectedDocument}
          history={getDocumentHistory(selectedDocument, snapshotStore)}
          onClose={() => setSelectedDocumentId(null)}
          onDelete={() => setDocumentToDelete(selectedDocument)}
          onDownload={trackDocumentDownload}
          onTabChange={setDocumentDrawerTab}
          store={snapshotStore}
        />
      ) : null}

      {documentToDelete ? (
        <ConfirmDeleteModal
          onCancel={() => setDocumentToDelete(null)}
          onConfirm={() => deleteDocument(documentToDelete)}
        />
      ) : null}
    </RouteShell>
  );
}

function upsertDocumentInStore(documents: PropertyDocument[], document: PropertyDocument) {
  return documents.some((candidate) => candidate.id === document.id)
    ? documents.map((candidate) => (candidate.id === document.id ? document : candidate))
    : [...documents, document];
}

function createEmptyDocument(
  store: { properties: { id: string }[]; units: { id: string; propertyId: string }[] },
  type: DocumentType = "bail",
): DocumentForm {
  const propertyId = store.properties[0]?.id ?? "";
  const unitId = store.units.find((unit) => unit.propertyId === propertyId)?.id ?? "";

  return {
    name: "",
    type,
    propertyId,
    unitId,
    relatedEntityType: "logement",
    relatedEntityId: unitId,
  };
}

function getInitialDocumentId() {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("document");
}

function getInitialUploadContextFromUrl(): DocumentUploadContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get("upload") !== "1") {
    return null;
  }

  const type = getDocumentTypeFromQuery(params.get("type"));
  const relatedEntityType = getRelatedEntityTypeFromQuery(params.get("relatedEntityType"));
  const leaseId = params.get("leaseId");

  return {
    initialLeaseId: leaseId,
    initialRelatedEntityId: params.get("relatedEntityId") || leaseId,
    initialRelatedEntityType: relatedEntityType ?? (leaseId ? "bail" : undefined),
    initialTenantId: params.get("tenantId"),
    initialType: type ?? "bail",
    initialUnitId: params.get("unitId"),
    propertyId: params.get("propertyId") ?? undefined,
    title: type === "bail" || !type ? "Ajouter le document du bail" : undefined,
  };
}

function clearDocumentUploadQuery() {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);

  if (!url.searchParams.has("upload")) {
    return;
  }

  ["upload", "type", "propertyId", "unitId", "tenantId", "leaseId", "relatedEntityType", "relatedEntityId"].forEach((key) => {
    url.searchParams.delete(key);
  });
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function getDocumentTypeFromQuery(value: string | null): DocumentType | undefined {
  return value && value in documentTypeLabel ? (value as DocumentType) : undefined;
}

function getRelatedEntityTypeFromQuery(value: string | null): DocumentRelatedEntityType | undefined {
  return value && value in relatedEntityTypeLabel ? (value as DocumentRelatedEntityType) : undefined;
}

function getDocumentHistory(document: PropertyDocument, store: LocalStore) {
  return store.activities
    .filter(
      (activity) =>
        activity.type === "document" &&
        activity.propertyId === document.propertyId &&
        (activity.unitId === document.unitId || !activity.unitId) &&
        activity.description.toLowerCase().includes(document.name.toLowerCase()),
    )
    .sort((a, b) => (b.createdAt ?? `${b.date}T12:00:00`).localeCompare(a.createdAt ?? `${a.date}T12:00:00`));
}

function DocumentDrawer({
  activeTab,
  document,
  history,
  onClose,
  onDelete,
  onDownload,
  onTabChange,
  store,
}: {
  activeTab: DocumentDrawerTab;
  document: PropertyDocument;
  history: UnitActivity[];
  onClose: () => void;
  onDelete: () => void;
  onDownload: (document: PropertyDocument) => void;
  onTabChange: (tab: DocumentDrawerTab) => void;
  store: LocalStore;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/55" aria-label="Fermer le panneau" type="button" onClick={onClose} />
      <aside
        className="custom-scrollbar absolute right-0 top-0 h-full w-full max-w-[480px] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-[-24px_0_60px_rgba(0,0,0,0.32)] sm:w-[460px]"
        role="dialog"
        aria-modal="true"
        aria-label={`Détails du document ${document.name}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--muted)]">{documentTypeLabel[document.type]}</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-[var(--foreground)]">{document.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)]"
            aria-label="Fermer"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
          <DrawerTabButton active={activeTab === "apercu"} onClick={() => onTabChange("apercu")}>
            Aperçu
          </DrawerTabButton>
          <DrawerTabButton active={activeTab === "informations"} onClick={() => onTabChange("informations")}>
            Informations
          </DrawerTabButton>
          <DrawerTabButton active={activeTab === "historique"} onClick={() => onTabChange("historique")}>
            Historique
          </DrawerTabButton>
        </div>

        {activeTab === "apercu" ? <DocumentPreview document={document} /> : null}
        {activeTab === "informations" ? <DocumentInformation document={document} store={store} /> : null}
        {activeTab === "historique" ? <DocumentHistory activities={history} /> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <DocumentFileActions document={document} onDownload={onDownload} />
          <button className="btn-danger" onClick={onDelete} type="button">
            Supprimer
          </button>
        </div>
      </aside>
    </div>
  );
}

function DrawerTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[color:var(--accent)] text-white"
          : "text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function DocumentPreview({ document }: { document: PropertyDocument }) {
  const [preview, setPreview] = useState<{ key: string; url: string | null } | null>(null);
  const imagePreview = hasDocumentFile(document) && (document.mimeType?.startsWith("image/") || document.type === "photo");
  const pdfPreview = document.mimeType === "application/pdf" || document.name.toLowerCase().endsWith(".pdf");
  const previewKey = `${document.id}:${document.storagePath ?? document.fileDataUrl ?? ""}`;
  const previewUrl = preview?.key === previewKey ? preview.url : null;

  useEffect(() => {
    let active = true;

    if (!imagePreview) {
      return;
    }

    getDocumentPreviewUrl(document)
      .then((url) => {
        if (active) {
          setPreview({ key: previewKey, url });
        }
      })
      .catch((error) => {
        console.error("Impossible de préparer l'aperçu du document.", error);
        if (active) {
          setPreview({ key: previewKey, url: null });
        }
      });

    return () => {
      active = false;
    };
  }, [document, imagePreview, previewKey]);

  if (!hasDocumentFile(document)) {
    return (
      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5 text-center">
        <p className="font-semibold text-[var(--foreground)]">{document.name}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Aucun fichier téléversé.</p>
      </div>
    );
  }

  if (imagePreview && previewUrl) {
    return (
      <div
        className="relative mt-6 h-[420px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] bg-contain bg-center bg-no-repeat"
        role="img"
        aria-label={document.name}
        style={{ backgroundImage: `url("${previewUrl}")` }}
      />
    );
  }

  if (pdfPreview) {
    return (
      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-[color:var(--red)]/30 bg-[color:var(--red)]/10 text-xl font-bold text-[color:var(--red)]">
          PDF
        </div>
        <p className="mt-4 font-semibold text-[var(--foreground)]">{document.name}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Aperçu PDF non intégré pour ce MVP.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
      <p className="font-semibold text-[var(--foreground)]">{document.name}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Type: {document.mimeType || documentTypeLabel[document.type]}
      </p>
    </div>
  );
}

function DocumentInformation({ document, store }: { document: PropertyDocument; store: LocalStore }) {
  return (
    <div className="mt-6 grid gap-3">
      <InfoCard label="Nom du document" value={document.name} />
      <InfoCard label="Type" value={documentTypeLabel[document.type]} />
      <InfoCard label="Immeuble" value={getPropertyName(document.propertyId, store)} />
      <InfoCard label="Logement" value={getUnitLabel(document.unitId, store)} />
      <InfoCard label="Entité liée" value={getRelatedEntityDescription(document, store)} />
      <InfoCard label="Date de téléversement" value={formatDate(document.uploadDate)} />
      <InfoCard label="Taille du fichier" value={formatFileSize(document.size)} />
      <InfoCard label="Notes" value={document.notes || "Aucune note."} />
    </div>
  );
}

function DocumentHistory({ activities }: { activities: UnitActivity[] }) {
  if (activities.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm font-medium text-[var(--muted)]">
        Aucun historique pour ce document.
      </p>
    );
  }

  return (
    <ol className="mt-6 grid gap-3">
      {activities.map((activity) => (
        <li key={activity.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="font-semibold text-[var(--foreground)]">{activity.title}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-[var(--muted)]">{formatDate(activity.date)}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{activity.description}</p>
        </li>
      ))}
    </ol>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
      <p className="text-xs font-medium uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function ConfirmDeleteModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <h2 className="text-2xl font-semibold">Supprimer le document ?</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Voulez-vous vraiment supprimer ce document ?</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-danger" onClick={onConfirm} type="button">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function getRelatedEntityOptions(store: LocalStore, relatedEntityType: DocumentRelatedEntityType) {
  if (relatedEntityType === "immeuble") {
    return store.properties.map((property) => ({
      value: property.id,
      label: property.name,
      propertyId: property.id,
      unitId: store.units.find((unit) => unit.propertyId === property.id)?.id ?? "",
    }));
  }

  if (relatedEntityType === "entretien") {
    return store.maintenanceTickets.map((ticket) => ({
      value: ticket.id,
      label: `${ticket.title} · ${getUnitLabel(ticket.unitId, store)}`,
      propertyId: ticket.propertyId,
      unitId: ticket.unitId,
    }));
  }

  if (relatedEntityType === "paiement") {
    return store.payments.map((payment) => ({
      value: payment.id,
      label: `${payment.month} · ${getUnitLabel(payment.unitId, store)}`,
      propertyId: payment.propertyId,
      unitId: payment.unitId,
    }));
  }

  return store.units.map((unit) => ({
    value: unit.id,
    label: `${getPropertyName(unit.propertyId, store)} · ${unit.label}`,
    propertyId: unit.propertyId,
    unitId: unit.id,
  }));
}

function getRelatedEntityDescription(document: PropertyDocument, store: LocalStore) {
  const entityType = document.relatedEntityType;

  if (!entityType) {
    return "Aucune entité liée.";
  }

  if (entityType === "immeuble") {
    return `${relatedEntityTypeLabel[entityType]} · ${getPropertyName(document.propertyId, store)}`;
  }

  if (entityType === "entretien") {
    const ticket = store.maintenanceTickets.find((candidate) => candidate.id === document.relatedEntityId);
    return `${relatedEntityTypeLabel[entityType]} · ${ticket?.title ?? "Demande"}`;
  }

  if (entityType === "paiement") {
    const payment = store.payments.find((candidate) => candidate.id === document.relatedEntityId);
    return `${relatedEntityTypeLabel[entityType]} · ${payment?.month ?? "Paiement"}`;
  }

  return `${relatedEntityTypeLabel[entityType]} · ${getUnitLabel(document.unitId, store)}`;
}

function formatFileSize(size?: number) {
  if (!size) {
    return "Non disponible";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} Ko`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function FormModal({
  children,
  onCancel,
  title,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Documents</p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[][];
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

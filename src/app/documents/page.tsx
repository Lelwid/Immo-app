"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RouteShell } from "@/app/components/route-shell";
import { AppIcon } from "@/components/AppIcon";
import { DocumentFileActions } from "@/components/DocumentFileActions";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { analyzeDocumentWithHabixaAi, DocumentAnalysisRequestError, getLatestLeaseExtractionForDocument } from "@/lib/data/documentAiAnalysisService";
import { createDocumentWithFile, deleteDocument as deleteDocumentRecord, getDocumentPreviewUrl, hasDocumentFile } from "@/lib/data/documentsService";
import { assignTenantToUnit, saveLeaseForUnit } from "@/lib/data/leaseAssignmentService";
import { documentTypeLabel, getPropertyName, getUnitLabel } from "@/lib/mockData";
import type { DocumentAiExtraction, DocumentRelatedEntityType, DocumentType, LeaseExtraction, LocalStore, PropertyDocument, Tenant, UnitActivity } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type DocumentFilter = "tous" | DocumentType;
type DocumentForm = Pick<PropertyDocument, "name" | "type" | "propertyId" | "unitId" | "relatedEntityType" | "relatedEntityId">;
type DocumentDrawerTab = "apercu" | "informations" | "historique";
type DocumentAnalysisStage = "idle" | "extracting" | "ocr" | "analyzing" | "success" | "error";
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
type LeaseExtractionForm = {
  bedroomCount: string;
  dueDay: string;
  importantNotes: string;
  landlordAddress: string;
  landlordEmail: string;
  landlordName: string;
  landlordPhone: string;
  leaseEndDate: string;
  leaseStartDate: string;
  monthlyRent: string;
  paymentFrequency: string;
  paymentMethod: string;
  propertyAddress: string;
  propertyCity: string;
  propertyPostalCode: string;
  propertyProvince: string;
  signedDate: string;
  tenantEmail: string;
  tenantName: string;
  tenantPhone: string;
  unitName: string;
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
  const [isDocumentDrawerOpen, setIsDocumentDrawerOpen] = useState(() => Boolean(getInitialDocumentId()));
  const [documentDrawerTab, setDocumentDrawerTab] = useState<DocumentDrawerTab>("apercu");
  const [documentToDelete, setDocumentToDelete] = useState<PropertyDocument | null>(null);
  const [analysisLoadingDocumentId, setAnalysisLoadingDocumentId] = useState<string | null>(null);
  const [analysisStage, setAnalysisStage] = useState<DocumentAnalysisStage>("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [leaseExtractionRecord, setLeaseExtractionRecord] = useState<DocumentAiExtraction | null>(null);
  const [leaseExtractionForm, setLeaseExtractionForm] = useState<LeaseExtractionForm | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [returnToDocumentAfterAnalysis, setReturnToDocumentAfterAnalysis] = useState(false);
  const [confirmDuplicateTenant, setConfirmDuplicateTenant] = useState(false);
  const [confirmingExtraction, setConfirmingExtraction] = useState(false);
  const confirmingExtractionRef = useRef(false);
  const [additionalLeasePageFiles, setAdditionalLeasePageFiles] = useState<File[]>([]);
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
  const matchedExistingTenant = leaseExtractionForm ? findMatchingTenant(leaseExtractionForm, snapshotStore) : null;

  useEffect(() => {
    let active = true;

    if (!selectedDocument || selectedDocument.type !== "bail") {
      return;
    }

    getLatestLeaseExtractionForDocument(selectedDocument.id)
      .then((extractionRecord) => {
        if (!active || !extractionRecord) {
          return;
        }

        setLeaseExtractionRecord(extractionRecord);
      })
      .catch(() => {
        if (active) {
          setLeaseExtractionRecord(null);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDocument]);

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
    setIsDocumentDrawerOpen(true);
    setDocumentDrawerTab("apercu");
    setAnalysisError(null);
    setAnalysisStage("idle");
    setLeaseExtractionRecord(null);
    setLeaseExtractionForm(null);
    setIsAnalysisModalOpen(false);
    setReturnToDocumentAfterAnalysis(false);
    setConfirmDuplicateTenant(false);
    setAdditionalLeasePageFiles([]);
  }

  function closeDocumentDrawer() {
    setIsDocumentDrawerOpen(false);
    setSelectedDocumentId(null);
    setAnalysisError(null);
    setAnalysisStage("idle");
    setLeaseExtractionRecord(null);
    setLeaseExtractionForm(null);
    setIsAnalysisModalOpen(false);
    setReturnToDocumentAfterAnalysis(false);
    setConfirmDuplicateTenant(false);
    setAdditionalLeasePageFiles([]);
  }

  function openAnalysisModal(form: LeaseExtractionForm) {
    setLeaseExtractionForm(form);
    setConfirmDuplicateTenant(false);
    setReturnToDocumentAfterAnalysis(true);
    setIsDocumentDrawerOpen(false);
    setIsAnalysisModalOpen(true);
  }

  function closeAnalysisModal() {
    setIsAnalysisModalOpen(false);
    setLeaseExtractionForm(null);
    setConfirmDuplicateTenant(false);

    if (returnToDocumentAfterAnalysis && selectedDocument) {
      setIsDocumentDrawerOpen(true);
    }

    setReturnToDocumentAfterAnalysis(false);
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

  async function analyzeLeaseDocument(document: PropertyDocument, reanalyze = false) {
    if (analysisLoadingDocumentId) {
      return;
    }

    setAnalysisLoadingDocumentId(document.id);
    setAnalysisStage("extracting");
    setAnalysisError(null);

    const analyzingTimer = window.setTimeout(() => {
      setAnalysisStage((stage) => (stage === "extracting" ? "analyzing" : stage));
    }, 700);

    try {
      const extractionRecord = await analyzeDocumentWithHabixaAi(document, {
        additionalImagePages: additionalLeasePageFiles,
        reanalyze,
      });
      if (extractionRecord.extractionMethod === "ocr" || extractionRecord.extractionMethod === "vision") {
        setAnalysisStage("ocr");
        await wait(350);
      }
      setLeaseExtractionRecord(extractionRecord);
      openAnalysisModal(createLeaseExtractionForm(extractionRecord.structuredData, document, snapshotStore));
      setAnalysisStage("success");
    } catch (error) {
      if (error instanceof DocumentAnalysisRequestError) {
        console.error("[Nexbail AI] Analyse du document échouée.", {
          code: error.code,
          details: error.details,
          message: error.message,
        });
      }
      setAnalysisError(error instanceof Error ? error.message : "Impossible d'analyser ce document. Vous pouvez continuer manuellement.");
      setAnalysisStage("error");
    } finally {
      window.clearTimeout(analyzingTimer);
      setAnalysisLoadingDocumentId(null);
    }
  }

  async function confirmLeaseExtraction(document: PropertyDocument) {
    if (!leaseExtractionForm || confirmingExtractionRef.current) {
      return;
    }

    confirmingExtractionRef.current = true;
    setConfirmingExtraction(true);
    setAnalysisError(null);

    try {
      const unit = resolveExtractionUnit(document, leaseExtractionForm, snapshotStore);

      if (!unit) {
        throw new Error("Associez ce document à un logement ou indiquez un logement existant avant de créer le bail.");
      }

      if (!leaseExtractionForm.tenantName.trim()) {
        throw new Error("Le nom du locataire est requis.");
      }

      const monthlyRent = Number(leaseExtractionForm.monthlyRent);

      if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
        throw new Error("Le loyer mensuel doit être valide.");
      }

      if (!leaseExtractionForm.leaseStartDate || !leaseExtractionForm.leaseEndDate) {
        throw new Error("Les dates de début et de fin du bail sont requises.");
      }

      if (matchedExistingTenant && !confirmDuplicateTenant) {
        const nextStore = await saveLeaseForUnit(snapshotStore, {
          leaseEndDate: leaseExtractionForm.leaseEndDate,
          leaseStartDate: leaseExtractionForm.leaseStartDate,
          monthlyRent,
          notes: buildLeaseExtractionNotes(leaseExtractionForm),
          paymentStatus: "dueSoon",
          tenantId: matchedExistingTenant.id,
          unitId: unit.id,
        });
        setStore(nextStore);
      } else {
        const nextStore = await assignTenantToUnit(snapshotStore, {
          email: leaseExtractionForm.tenantEmail,
          fullName: leaseExtractionForm.tenantName,
          leaseEndDate: leaseExtractionForm.leaseEndDate,
          leaseStartDate: leaseExtractionForm.leaseStartDate,
          monthlyRent,
          notes: buildLeaseExtractionNotes(leaseExtractionForm),
          paymentStatus: "dueSoon",
          phone: leaseExtractionForm.tenantPhone,
          propertyId: unit.propertyId,
          unitId: unit.id,
        });
        setStore(nextStore);
      }

      const refreshed = await refreshPortfolioSnapshot();
      const refreshedStore = refreshed ?? snapshotStore;
      const activeLease = refreshedStore.leases.find((lease) => lease.unitId === unit.id && lease.status === "active");
      const activity = await createActivityRecord({
        propertyId: unit.propertyId,
        unitId: unit.id,
        tenantId: activeLease?.tenantId ?? matchedExistingTenant?.id ?? document.tenantId,
        leaseId: activeLease?.id,
        type: "bail",
        title: "Bail créé à partir d'un document analysé",
        description: `${document.name} a été validé par l'utilisateur avant la création du bail.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshPortfolioSnapshot();
      setLeaseExtractionForm(null);
      setLeaseExtractionRecord(null);
      setIsAnalysisModalOpen(false);
      setReturnToDocumentAfterAnalysis(false);
      setIsDocumentDrawerOpen(true);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Impossible de créer le bail à partir de l'analyse.");
    } finally {
      confirmingExtractionRef.current = false;
      setConfirmingExtraction(false);
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
                className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
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
                {document.unitId ? <Info label="Logement" value={getUnitLabel(document.unitId, snapshotStore)} /> : null}
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

      {selectedDocument && isDocumentDrawerOpen ? (
        <DocumentDrawer
          activeTab={documentDrawerTab}
          analysisError={analysisError}
          analysisLoading={analysisLoadingDocumentId === selectedDocument.id}
          analysisStage={analysisLoadingDocumentId === selectedDocument.id ? analysisStage : leaseExtractionRecord ? "success" : analysisStage}
          document={selectedDocument}
          history={getDocumentHistory(selectedDocument, snapshotStore)}
          leaseExtractionRecord={leaseExtractionRecord}
          additionalPageFiles={additionalLeasePageFiles}
          onAnalyze={(reanalyze) => analyzeLeaseDocument(selectedDocument, reanalyze)}
          onAdditionalPagesChange={setAdditionalLeasePageFiles}
          onClose={closeDocumentDrawer}
          onDelete={() => setDocumentToDelete(selectedDocument)}
          onDownload={trackDocumentDownload}
          onOpenExtraction={() => {
            if (leaseExtractionRecord) {
              openAnalysisModal(createLeaseExtractionForm(leaseExtractionRecord.structuredData, selectedDocument, snapshotStore));
            }
          }}
          onTabChange={setDocumentDrawerTab}
          store={snapshotStore}
        />
      ) : null}

      {selectedDocument && leaseExtractionForm && isAnalysisModalOpen ? (
        <LeaseExtractionValidationModal
          document={selectedDocument}
          duplicateTenant={matchedExistingTenant}
          form={leaseExtractionForm}
          onCancel={closeAnalysisModal}
          onChange={setLeaseExtractionForm}
          onConfirm={() => confirmLeaseExtraction(selectedDocument)}
          saving={confirmingExtraction}
          confidence={leaseExtractionRecord?.confidence ?? leaseExtractionRecord?.structuredData.confidenceByField ?? {}}
          confirmDuplicateTenant={confirmDuplicateTenant}
          onConfirmDuplicateTenantChange={setConfirmDuplicateTenant}
          error={analysisError}
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
  return value && value !== "locataire" && value in relatedEntityTypeLabel ? (value as DocumentRelatedEntityType) : undefined;
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
  additionalPageFiles,
  analysisError,
  analysisLoading,
  analysisStage,
  document,
  history,
  leaseExtractionRecord,
  onAnalyze,
  onAdditionalPagesChange,
  onClose,
  onDelete,
  onDownload,
  onOpenExtraction,
  onTabChange,
  store,
}: {
  activeTab: DocumentDrawerTab;
  additionalPageFiles: File[];
  analysisError: string | null;
  analysisLoading: boolean;
  analysisStage: DocumentAnalysisStage;
  document: PropertyDocument;
  history: UnitActivity[];
  leaseExtractionRecord: DocumentAiExtraction | null;
  onAnalyze: (reanalyze: boolean) => void;
  onAdditionalPagesChange: (files: File[]) => void;
  onClose: () => void;
  onDelete: () => void;
  onDownload: (document: PropertyDocument) => void;
  onOpenExtraction: () => void;
  onTabChange: (tab: DocumentDrawerTab) => void;
  store: LocalStore;
}) {
  const canAnalyzeLease = canAnalyzeLeaseDocument(document);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 top-12 z-50">
      <button className="absolute inset-0 bg-black/55" aria-label="Fermer le panneau" type="button" onClick={onClose} />
      <aside
        className="absolute bottom-0 right-0 top-0 flex h-dvh w-full max-w-[480px] flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface)] shadow-[-24px_0_60px_rgba(0,0,0,0.32)] sm:w-[460px]"
        role="dialog"
        aria-modal="true"
        aria-label={`Détails du document ${document.name}`}
      >
        <div className="shrink-0 bg-[var(--surface)] p-5 pb-0">
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
              <AppIcon name="file-text" size={16} />
              <span>Aperçu</span>
            </DrawerTabButton>
            <DrawerTabButton active={activeTab === "informations"} onClick={() => onTabChange("informations")}>
              <AppIcon name="layout-dashboard" size={16} />
              <span>Informations</span>
            </DrawerTabButton>
            <DrawerTabButton active={activeTab === "historique"} onClick={() => onTabChange("historique")}>
              <AppIcon name="history" size={16} />
              <span>Historique</span>
            </DrawerTabButton>
          </div>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {activeTab === "apercu" ? <DocumentPreview document={document} /> : null}
          {activeTab === "informations" ? <DocumentInformation document={document} store={store} /> : null}
          {activeTab === "historique" ? <DocumentHistory activities={history} /> : null}

          {canAnalyzeLease ? (
            <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Nexbail AI</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {getAnalysisStatusMessage(analysisStage, leaseExtractionRecord)}
                  </p>
                  {additionalPageFiles.length > 0 ? (
                    <p className="mt-2 text-xs font-semibold uppercase text-[color:var(--accent)]">
                      {additionalPageFiles.length} page{additionalPageFiles.length > 1 ? "s" : ""} photo sélectionnée{additionalPageFiles.length > 1 ? "s" : ""}
                    </p>
                  ) : null}
                  {leaseExtractionRecord?.extractionMethod ? (
                    <p className="mt-2 text-xs font-semibold uppercase text-[var(--muted)]">
                      Extraction {getExtractionMethodLabel(leaseExtractionRecord.extractionMethod)}
                      {leaseExtractionRecord.pageCount ? ` · ${leaseExtractionRecord.pageCount} page${leaseExtractionRecord.pageCount > 1 ? "s" : ""}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {leaseExtractionRecord ? (
                    <button className="btn-secondary" disabled={analysisLoading} onClick={onOpenExtraction} type="button">
                      Voir l&apos;analyse
                    </button>
                  ) : null}
                  <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={analysisLoading} onClick={() => onAnalyze(Boolean(leaseExtractionRecord))} type="button">
                    {analysisLoading ? "Analyse..." : leaseExtractionRecord ? "Analyser de nouveau" : "Analyser avec Nexbail AI"}
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">Pages photo du bail</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Ajoutez d&apos;autres pages JPG, PNG ou WebP à analyser comme un seul bail.</p>
                  </div>
                  <label className="btn-secondary inline-flex shrink-0 items-center justify-center">
                    Ajouter les pages
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      disabled={analysisLoading}
                      multiple
                      type="file"
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        onAdditionalPagesChange(files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {additionalPageFiles.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[color:var(--accent)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--accent)]">
                      {additionalPageFiles.length} page{additionalPageFiles.length > 1 ? "s" : ""} sélectionnée{additionalPageFiles.length > 1 ? "s" : ""}
                    </span>
                    <button className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]" disabled={analysisLoading} onClick={() => onAdditionalPagesChange([])} type="button">
                      Retirer
                    </button>
                  </div>
                ) : null}
              </div>
              {analysisError ? <p className="mt-3 text-sm font-semibold text-[color:var(--red)]">{analysisError}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <DocumentFileActions document={document} onDownload={onDownload} />
          <button className="btn-danger" onClick={onDelete} type="button">
            Supprimer
          </button>
          </div>
        </div>
      </aside>
    </div>,
    window.document.body,
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

function getAnalysisStatusMessage(stage: DocumentAnalysisStage, extractionRecord: DocumentAiExtraction | null) {
  if (stage === "extracting") {
    return "Lecture du document…";
  }

  if (stage === "ocr") {
    return "Reconnaissance visuelle du document…";
  }

  if (stage === "analyzing") {
    return "Nexbail AI analyse le bail…";
  }

  if (stage === "error") {
    return "L'analyse n'a pas pu être complétée.";
  }

  if (extractionRecord) {
    return "Une analyse complétée est disponible pour ce bail.";
  }

  return "Préremplissez un bail à partir de ce PDF, puis validez les champs détectés.";
}

function canAnalyzeLeaseDocument(document: PropertyDocument) {
  if (document.type !== "bail" || !hasDocumentFile(document)) {
    return false;
  }

  const mimeType = document.mimeType?.toLowerCase() ?? "";
  const name = document.name.toLowerCase();

  return (
    mimeType === "application/pdf" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp" ||
    name.endsWith(".pdf") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp")
  );
}

function getExtractionMethodLabel(method: DocumentAiExtraction["extractionMethod"]) {
  if (method === "vision") {
    return "vision";
  }

  if (method === "ocr") {
    return "OCR";
  }

  return "native";
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
        <p className="break-all font-semibold text-[var(--foreground)]">{document.name}</p>
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
        <p className="mt-4 break-all font-semibold text-[var(--foreground)]">{document.name}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Aperçu PDF non intégré pour ce MVP.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
      <p className="break-all font-semibold text-[var(--foreground)]">{document.name}</p>
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
      {document.unitId ? <InfoCard label="Logement" value={getUnitLabel(document.unitId, store)} /> : null}
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
      <p className="mt-1 break-words font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function ConfirmDeleteModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:px-4 sm:py-6">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] sm:p-6">
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

function LeaseExtractionValidationModal({
  confidence,
  confirmDuplicateTenant,
  document,
  duplicateTenant,
  error,
  form,
  onCancel,
  onChange,
  onConfirm,
  onConfirmDuplicateTenantChange,
  saving,
}: {
  confidence: Record<string, number>;
  confirmDuplicateTenant: boolean;
  document: PropertyDocument;
  duplicateTenant: Tenant | null;
  error: string | null;
  form: LeaseExtractionForm;
  onCancel: () => void;
  onChange: (form: LeaseExtractionForm) => void;
  onConfirm: () => void;
  onConfirmDuplicateTenantChange: (value: boolean) => void;
  saving: boolean;
}) {
  const canConfirm =
    Boolean(form.tenantName.trim() && form.monthlyRent && form.leaseStartDate && form.leaseEndDate && !saving) &&
    (!duplicateTenant || !confirmDuplicateTenant || Boolean(form.tenantName.trim()));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        event.stopPropagation();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, saving]);

  if (typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:px-4 sm:py-6" onMouseDown={saving ? undefined : onCancel}>
      <div
        className="custom-scrollbar max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] sm:max-h-[90dvh] sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Informations détectées"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Nexbail AI</p>
            <h2 className="mt-1 text-2xl font-semibold">Informations détectées</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Vérifiez les champs proposés depuis {document.name}. Aucune donnée métier n&apos;est modifiée avant confirmation.
            </p>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>

        <div className="grid gap-5">
          <FormSection title="Locataire">
            <ExtractionTextInput confidence={confidence.tenantName} label="Nom" value={form.tenantName} onChange={(tenantName) => onChange({ ...form, tenantName })} />
            <ExtractionTextInput confidence={confidence.tenantEmail} label="Courriel" type="email" value={form.tenantEmail} onChange={(tenantEmail) => onChange({ ...form, tenantEmail })} />
            <ExtractionTextInput confidence={confidence.tenantPhone} label="Téléphone" value={form.tenantPhone} onChange={(tenantPhone) => onChange({ ...form, tenantPhone })} />
          </FormSection>

          <FormSection title="Locateur">
            <ExtractionTextInput confidence={confidence.landlordName} label="Nom" value={form.landlordName} onChange={(landlordName) => onChange({ ...form, landlordName })} />
            <ExtractionTextInput
              confidence={confidence.landlordAddress}
              label="Adresse"
              value={form.landlordAddress}
              onChange={(landlordAddress) => onChange({ ...form, landlordAddress })}
            />
            <ExtractionTextInput
              confidence={confidence.landlordEmail}
              label="Courriel"
              type="email"
              value={form.landlordEmail}
              onChange={(landlordEmail) => onChange({ ...form, landlordEmail })}
            />
            <ExtractionTextInput confidence={confidence.landlordPhone} label="Téléphone" value={form.landlordPhone} onChange={(landlordPhone) => onChange({ ...form, landlordPhone })} />
          </FormSection>

          <FormSection title="Logement">
            <ExtractionTextInput
              confidence={confidence.propertyAddress}
              label="Adresse"
              value={form.propertyAddress}
              onChange={(propertyAddress) => onChange({ ...form, propertyAddress })}
            />
            <ExtractionTextInput confidence={confidence.propertyCity} label="Ville" value={form.propertyCity} onChange={(propertyCity) => onChange({ ...form, propertyCity })} />
            <ExtractionTextInput
              confidence={confidence.propertyProvince}
              label="Province"
              value={form.propertyProvince}
              onChange={(propertyProvince) => onChange({ ...form, propertyProvince })}
            />
            <ExtractionTextInput
              confidence={confidence.propertyPostalCode}
              label="Code postal"
              value={form.propertyPostalCode}
              onChange={(propertyPostalCode) => onChange({ ...form, propertyPostalCode })}
            />
            <ExtractionTextInput confidence={confidence.unitName} label="Logement" value={form.unitName} onChange={(unitName) => onChange({ ...form, unitName })} />
            <ExtractionTextInput
              confidence={confidence.bedroomCount}
              label="Chambres"
              type="number"
              value={form.bedroomCount}
              onChange={(bedroomCount) => onChange({ ...form, bedroomCount })}
            />
          </FormSection>

          <FormSection title="Bail">
            <ExtractionTextInput confidence={confidence.monthlyRent} label="Loyer" type="number" value={form.monthlyRent} onChange={(monthlyRent) => onChange({ ...form, monthlyRent })} />
            <ExtractionTextInput
              confidence={confidence.paymentFrequency}
              label="Fréquence"
              value={form.paymentFrequency}
              onChange={(paymentFrequency) => onChange({ ...form, paymentFrequency })}
            />
            <ExtractionTextInput
              confidence={confidence.leaseStartDate}
              label="Début"
              type="date"
              value={form.leaseStartDate}
              onChange={(leaseStartDate) => onChange({ ...form, leaseStartDate })}
            />
            <ExtractionTextInput confidence={confidence.leaseEndDate} label="Fin" type="date" value={form.leaseEndDate} onChange={(leaseEndDate) => onChange({ ...form, leaseEndDate })} />
            <ExtractionTextInput confidence={confidence.signedDate} label="Signature" type="date" value={form.signedDate} onChange={(signedDate) => onChange({ ...form, signedDate })} />
            <ExtractionTextInput confidence={confidence.dueDay} label="Jour d'échéance" type="number" value={form.dueDay} onChange={(dueDay) => onChange({ ...form, dueDay })} />
            <ExtractionTextInput
              confidence={confidence.paymentMethod}
              label="Mode de paiement"
              value={form.paymentMethod}
              onChange={(paymentMethod) => onChange({ ...form, paymentMethod })}
            />
          </FormSection>

          <FormSection title="Informations supplémentaires">
            <ExtractionTextArea
              confidence={confidence.importantNotes}
              label="Remarques importantes"
              value={form.importantNotes}
              onChange={(importantNotes) => onChange({ ...form, importantNotes })}
            />
          </FormSection>

          {duplicateTenant ? (
            <div className="rounded-lg border border-[color:var(--yellow)]/30 bg-[color:var(--yellow)]/10 p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">Locataire existant détecté</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {getTenantDisplayName(duplicateTenant)} semble correspondre. Par défaut, Nexbail utilisera ce locataire au lieu de créer un doublon.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
                <input
                  checked={confirmDuplicateTenant}
                  className="h-4 w-4 accent-[color:var(--accent)]"
                  disabled={saving}
                  onChange={(event) => onConfirmDuplicateTenantChange(event.target.checked)}
                  type="checkbox"
                />
                Créer quand même un nouveau locataire
              </label>
            </div>
          ) : null}

          {error ? <p className="text-sm font-semibold text-[color:var(--red)]">{error}</p> : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary" disabled={saving} onClick={onCancel} type="button">
              Annuler
            </button>
            <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!canConfirm} onClick={onConfirm} type="button">
              {saving ? "Création..." : "Confirmer les informations"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    window.document.body,
  );
}

function FormSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">{title}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function ExtractionTextInput({
  confidence,
  label,
  onChange,
  type = "text",
  value,
}: {
  confidence?: number;
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  const confidenceLabel = getConfidenceLabel(confidence);

  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      <span className="flex items-center justify-between gap-3">
        {label}
        {confidenceLabel ? <ConfidenceBadge label={confidenceLabel} /> : null}
      </span>
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ExtractionTextArea({
  confidence,
  label,
  onChange,
  value,
}: {
  confidence?: number;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const confidenceLabel = getConfidenceLabel(confidence);

  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)] md:col-span-2">
      <span className="flex items-center justify-between gap-3">
        {label}
        {confidenceLabel ? <ConfidenceBadge label={confidenceLabel} /> : null}
      </span>
      <textarea
        className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ConfidenceBadge({ label }: { label: "attention" | "verify" }) {
  return (
    <span className="rounded-full bg-[color:var(--yellow)]/10 px-2 py-0.5 text-xs font-semibold text-[color:var(--yellow)]">
      {label === "verify" ? "À vérifier" : "Confiance moyenne"}
    </span>
  );
}

function getConfidenceLabel(confidence?: number): "attention" | "verify" | null {
  if (typeof confidence !== "number") {
    return null;
  }

  if (confidence < 0.7) {
    return "verify";
  }

  if (confidence < 0.9) {
    return "attention";
  }

  return null;
}

function createLeaseExtractionForm(extraction: LeaseExtraction, document: PropertyDocument, store: LocalStore): LeaseExtractionForm {
  const documentUnit = document.unitId ? store.units.find((unit) => unit.id === document.unitId) : null;
  const documentProperty = document.propertyId ? store.properties.find((property) => property.id === document.propertyId) : null;

  return {
    bedroomCount: extraction.bedroomCount ? String(extraction.bedroomCount) : "",
    dueDay: extraction.dueDay ? String(extraction.dueDay) : "",
    importantNotes: extraction.importantNotes ?? "",
    landlordAddress: extraction.landlordAddress ?? "",
    landlordEmail: extraction.landlordEmail ?? "",
    landlordName: extraction.landlordName ?? "",
    landlordPhone: extraction.landlordPhone ?? "",
    leaseEndDate: extraction.leaseEndDate ?? "",
    leaseStartDate: extraction.leaseStartDate ?? "",
    monthlyRent: extraction.monthlyRent ? String(extraction.monthlyRent) : "",
    paymentFrequency: extraction.paymentFrequency ?? "",
    paymentMethod: extraction.paymentMethod ?? "",
    propertyAddress: extraction.propertyAddress ?? documentProperty?.address ?? "",
    propertyCity: extraction.propertyCity ?? documentProperty?.city ?? "",
    propertyPostalCode: extraction.propertyPostalCode ?? documentProperty?.postalCode ?? "",
    propertyProvince: extraction.propertyProvince ?? documentProperty?.province ?? "",
    signedDate: extraction.signedDate ?? "",
    tenantEmail: extraction.tenantEmail ?? "",
    tenantName: extraction.tenantName ?? "",
    tenantPhone: extraction.tenantPhone ?? "",
    unitName: extraction.unitName ?? extraction.unitNumber ?? documentUnit?.label ?? "",
  };
}

function buildLeaseExtractionNotes(form: LeaseExtractionForm) {
  const lines = [
    "Créé à partir d'un bail analysé par Nexbail AI.",
    form.landlordName ? `Locateur: ${form.landlordName}` : "",
    form.landlordPhone ? `Téléphone du locateur: ${form.landlordPhone}` : "",
    form.landlordEmail ? `Courriel du locateur: ${form.landlordEmail}` : "",
    form.signedDate ? `Date de signature: ${form.signedDate}` : "",
    form.paymentFrequency ? `Fréquence de paiement: ${form.paymentFrequency}` : "",
    form.paymentMethod ? `Mode de paiement: ${form.paymentMethod}` : "",
    form.bedroomCount ? `Nombre de chambres: ${form.bedroomCount}` : "",
    form.importantNotes ? `Remarques: ${form.importantNotes}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function findMatchingTenant(form: LeaseExtractionForm, store: LocalStore): Tenant | null {
  const email = form.tenantEmail.trim().toLowerCase();
  const name = normalizeSearchText(form.tenantName);

  if (!email && !name) {
    return null;
  }

  return (
    store.tenants.find((tenant) => {
      if (tenant.archivedAt) {
        return false;
      }

      const tenantEmail = tenant.email.trim().toLowerCase();
      const tenantName = normalizeSearchText(getTenantDisplayName(tenant));

      return Boolean((email && tenantEmail === email) || (name && tenantName === name));
    }) ?? null
  );
}

function getTenantDisplayName(tenant: Tenant) {
  return tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim();
}

function resolveExtractionUnit(document: PropertyDocument, form: LeaseExtractionForm, store: LocalStore) {
  if (document.unitId) {
    const documentUnit = store.units.find((unit) => unit.id === document.unitId);

    if (documentUnit) {
      return documentUnit;
    }
  }

  if (document.relatedEntityType === "logement" && document.relatedEntityId) {
    const relatedUnit = store.units.find((unit) => unit.id === document.relatedEntityId);

    if (relatedUnit) {
      return relatedUnit;
    }
  }

  const propertyId = resolveExtractionPropertyId(document, form, store);
  const normalizedUnit = normalizeSearchText(form.unitName);

  return (
    store.units.find((unit) => {
      if (propertyId && unit.propertyId !== propertyId) {
        return false;
      }

      return normalizedUnit && normalizeSearchText(unit.label) === normalizedUnit;
    }) ?? null
  );
}

function resolveExtractionPropertyId(document: PropertyDocument, form: LeaseExtractionForm, store: LocalStore) {
  if (document.propertyId) {
    return document.propertyId;
  }

  const normalizedAddress = normalizeSearchText(form.propertyAddress);

  if (!normalizedAddress) {
    return "";
  }

  return (
    store.properties.find((property) => {
      const address = normalizeSearchText(property.address);

      return address && (address.includes(normalizedAddress) || normalizedAddress.includes(address));
    })?.id ?? ""
  );
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function wait(durationMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:px-4 sm:py-6">
      <div className="custom-scrollbar max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] sm:max-h-[90dvh] sm:p-6">
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

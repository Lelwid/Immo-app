"use client";

import { useMemo, useState } from "react";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { createDocumentWithFile } from "@/lib/data/documentsService";
import { documentFileAccept, validateDocumentFile } from "@/lib/fileValidation";
import { documentTypeLabel, getPropertyName, getUnitLabel } from "@/lib/mockData";
import type { DocumentRelatedEntityType, DocumentType, LocalStore, PropertyDocument, UnitActivity } from "@/lib/types";

type DocumentForm = Pick<PropertyDocument, "name" | "type" | "propertyId" | "unitId" | "tenantId" | "leaseId" | "relatedEntityType" | "relatedEntityId" | "notes" | "visibility">;

type RelatedOption = {
  value: string;
  label: string;
  propertyId: string;
  unitId?: string;
  tenantId?: string | null;
  leaseId?: string | null;
};

type DocumentUploadResult = {
  activity: UnitActivity | null;
  document: PropertyDocument;
};

type DocumentUploadModalProps = {
  initialLeaseId?: string | null;
  initialRelatedEntityId?: string | null;
  initialRelatedEntityType?: DocumentRelatedEntityType;
  initialTenantId?: string | null;
  initialType?: DocumentType;
  initialUnitId?: string | null;
  onCancel: () => void;
  onUploaded: (result: DocumentUploadResult) => void | Promise<void>;
  propertyId?: string;
  store: LocalStore;
  title?: string;
};

const documentTypes = Object.entries(documentTypeLabel) as [DocumentType, string][];

const relatedEntityTypeLabel: Record<DocumentRelatedEntityType, string> = {
  immeuble: "Immeuble",
  logement: "Logement",
  locataire: "Bail",
  bail: "Bail",
  entretien: "Demande d'entretien",
  paiement: "Paiement",
};

const selectableRelatedEntityTypes = new Set<DocumentRelatedEntityType>(["immeuble", "logement", "bail", "entretien", "paiement"]);

export function DocumentUploadModal({
  initialLeaseId,
  initialRelatedEntityId,
  initialRelatedEntityType,
  initialTenantId,
  initialType = "bail",
  initialUnitId,
  onCancel,
  onUploaded,
  propertyId,
  store,
  title = "Ajouter un document",
}: DocumentUploadModalProps) {
  const [form, setForm] = useState<DocumentForm>(() =>
    createEmptyDocumentForm(store, initialType, propertyId, {
      leaseId: initialLeaseId,
      relatedEntityId: initialRelatedEntityId,
      relatedEntityType: initialRelatedEntityType,
      tenantId: initialTenantId,
      unitId: initialUnitId,
    }),
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propertyName = propertyId ? getPropertyName(propertyId, store) : "";
  const relatedOptions = useMemo(
    () => getRelatedEntityOptions(store, form.relatedEntityType ?? "logement", propertyId),
    [form.relatedEntityType, propertyId, store],
  );
  const relatedTypeOptions = useMemo(
    () =>
      (Object.entries(relatedEntityTypeLabel) as [DocumentRelatedEntityType, string][])
        .filter(([type]) => selectableRelatedEntityTypes.has(type))
        .filter(([type]) => !propertyId || type === "immeuble" || type === "logement" || type === "bail")
        .map(([value, label]) => [value, label]),
    [propertyId],
  );
  const canSubmit = Boolean(selectedFile && form.name.trim() && form.propertyId && form.relatedEntityId && !saving);

  async function submitDocument() {
    if (!canSubmit || !selectedFile) {
      return;
    }

    const validationError = validateDocumentFile(selectedFile);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    const now = new Date().toISOString();

    try {
      const document = await createDocumentWithFile(
        {
          ...form,
          name: form.name.trim(),
          uploadDate: now.slice(0, 10),
          uploadedAt: now,
        },
        selectedFile,
      );
      let activity: UnitActivity | null = null;

      try {
        activity = await createActivityRecord({
          propertyId: document.propertyId,
          unitId: document.unitId,
          tenantId: document.tenantId,
          leaseId: document.leaseId,
          type: "document",
          title: "Document téléversé",
          description: `${document.name} a été téléversé dans la bibliothèque documentaire.`,
          date: document.uploadDate,
        });
      } catch (activityError) {
        console.error("Impossible de créer l'activité du document.", activityError);
      }

      await onUploaded({ activity, document });
    } catch (uploadError) {
      console.error("Impossible de téléverser le document.", uploadError);
      setError("Impossible de téléverser le document. Réessayez dans quelques instants.");
      setSaving(false);
    }
  }

  function updateRelatedType(relatedEntityType: DocumentRelatedEntityType) {
    const firstOption = getRelatedEntityOptions(store, relatedEntityType, propertyId)[0];
    setForm({
      ...form,
      ...getDocumentRelationship(firstOption, relatedEntityType),
    });
  }

  function updateRelatedEntity(relatedEntityId: string) {
    const option = relatedOptions.find((candidate) => candidate.value === relatedEntityId);
    setForm({
      ...form,
      ...getDocumentRelationship(option, form.relatedEntityType ?? "logement"),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Documents</p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
            {propertyName ? <p className="mt-2 text-sm text-[var(--muted)]">Immeuble: {propertyName}</p> : null}
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

        <div className="grid gap-3">
          <TextInput label="Nom du document" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Fichier
            <input
              accept={documentFileAccept}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
              disabled={saving}
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
                setError(file ? validateDocumentFile(file) : null);
                if (file && !form.name.trim()) {
                  setForm({ ...form, name: file.name });
                }
              }}
            />
          </label>
          <SelectInput
            label="Type"
            value={form.type}
            onChange={(type) => setForm({ ...form, type: type as DocumentType })}
            options={documentTypes}
            disabled={saving}
          />
          <SelectInput
            label="Visibilité"
            value={form.visibility ?? "private"}
            onChange={(visibility) => setForm({ ...form, visibility: visibility === "tenant" ? "tenant" : "private" })}
            options={[
              ["private", "Privé propriétaire"],
              ["tenant", "Visible dans le portail locataire"],
            ]}
            disabled={saving}
          />
          {propertyName ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">Immeuble</p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{propertyName}</p>
            </div>
          ) : null}
          <SelectInput
            label="Attacher à"
            value={form.relatedEntityType ?? "logement"}
            onChange={(relatedEntityType) => updateRelatedType(relatedEntityType as DocumentRelatedEntityType)}
            options={relatedTypeOptions}
            disabled={saving}
          />
          <SelectInput
            label="Élément lié"
            value={form.relatedEntityId ?? ""}
            onChange={updateRelatedEntity}
            options={relatedOptions.map((option) => [option.value, option.label])}
            disabled={saving}
          />
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Notes optionnelles
            <textarea
              className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              disabled={saving}
              value={form.notes ?? ""}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
          {error ? <p className="text-sm font-semibold text-[color:var(--red)]">{error}</p> : null}
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary" disabled={saving} onClick={onCancel} type="button">
              Annuler
            </button>
            <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!canSubmit} onClick={submitDocument} type="button">
              {saving ? "Téléversement..." : "Téléverser"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function createEmptyDocumentForm(
  store: LocalStore,
  type: DocumentType,
  propertyId?: string,
  initialRelationship?: {
    leaseId?: string | null;
    relatedEntityId?: string | null;
    relatedEntityType?: DocumentRelatedEntityType;
    tenantId?: string | null;
    unitId?: string | null;
  },
): DocumentForm {
  const relatedEntityType: DocumentRelatedEntityType =
    initialRelationship?.relatedEntityType === "locataire"
      ? "bail"
      : initialRelationship?.relatedEntityType ?? (propertyId ? "immeuble" : "logement");
  const options = getRelatedEntityOptions(store, relatedEntityType, propertyId);
  const firstOption =
    options.find(
      (option) =>
        option.value === initialRelationship?.relatedEntityId ||
        option.leaseId === initialRelationship?.leaseId ||
        option.unitId === initialRelationship?.unitId ||
        option.tenantId === initialRelationship?.tenantId,
    ) ?? options[0];

  return {
    name: "",
    type,
    visibility: "private",
    ...getDocumentRelationship(firstOption, relatedEntityType),
  };
}

function getDocumentRelationship(option: RelatedOption | undefined, relatedEntityType: DocumentRelatedEntityType) {
  return {
    propertyId: option?.propertyId ?? "",
    unitId: option?.unitId ?? "",
    tenantId: option?.tenantId ?? null,
    leaseId: option?.leaseId ?? null,
    relatedEntityType,
    relatedEntityId: option?.value ?? "",
  };
}

function getRelatedEntityOptions(store: LocalStore, relatedEntityType: DocumentRelatedEntityType, propertyScopeId?: string): RelatedOption[] {
  const propertyIds = new Set(propertyScopeId ? [propertyScopeId] : store.properties.map((property) => property.id));

  if (relatedEntityType === "immeuble") {
    return store.properties
      .filter((property) => propertyIds.has(property.id))
      .map((property) => ({
        value: property.id,
        label: property.name,
        propertyId: property.id,
      }));
  }

  if (relatedEntityType === "logement") {
    return store.units
      .filter((unit) => propertyIds.has(unit.propertyId))
      .map((unit) => ({
        value: unit.id,
        label: `${getPropertyName(unit.propertyId, store)} · ${unit.label}`,
        propertyId: unit.propertyId,
        unitId: unit.id,
      }));
  }

  if (relatedEntityType === "bail") {
    return store.leases
      .filter((lease) => lease.status === "active" && propertyIds.has(lease.propertyId))
      .map((lease) => {
        const tenant = store.tenants.find((candidate) => candidate.id === lease.tenantId);

        return {
          value: lease.id,
          label: `${getTenantDisplayName(tenant)} · ${getUnitLabel(lease.unitId, store)} · ${lease.startDate} au ${lease.endDate}`,
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          tenantId: lease.tenantId,
          leaseId: lease.id,
        };
      });
  }

  if (relatedEntityType === "entretien") {
    return store.maintenanceTickets
      .filter((ticket) => propertyIds.has(ticket.propertyId))
      .map((ticket) => ({
        value: ticket.id,
        label: `${ticket.title} · ${getUnitLabel(ticket.unitId, store)}`,
        propertyId: ticket.propertyId,
        unitId: ticket.unitId,
      }));
  }

  return store.payments
    .filter((payment) => propertyIds.has(payment.propertyId))
    .map((payment) => ({
      value: payment.id,
      label: `${payment.month} · ${getUnitLabel(payment.unitId, store)}`,
      propertyId: payment.propertyId,
      unitId: payment.unitId,
      tenantId: payment.tenantId,
      leaseId: payment.leaseId,
    }));
}

function getTenantDisplayName(tenant: LocalStore["tenants"][number] | undefined) {
  if (!tenant) {
    return "Locataire";
  }

  return tenant.fullName || `${tenant.firstName} ${tenant.lastName}`.trim();
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
  disabled = false,
  label,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
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
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 ? <option value="">Aucun élément disponible</option> : null}
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

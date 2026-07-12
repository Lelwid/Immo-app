"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { DocumentFileActions } from "@/components/DocumentFileActions";
import { NotesPanel } from "@/components/NotesPanel";
import { TaskComposer } from "@/components/TaskComposer";
import { getUnitOccupancy, type UnitOccupationView } from "@/lib/data/leaseAdapters";
import {
  assignTenantToUnit,
  endActiveLeaseForUnit,
} from "@/lib/data/leaseAssignmentService";
import { loadPortfolioSnapshot, refreshSnapshot, type PortfolioSnapshot } from "@/lib/data/portfolioSnapshotService";
import {
  currency,
  documentTypeLabel,
  getPropertyActivities,
  getPropertyDashboards,
  paymentStatusLabel,
  rentPaymentStatusLabel,
  ticketPriorityLabel,
  ticketStatusLabel,
} from "@/lib/mockData";
import { exportPropertyReport } from "@/lib/reportExports";
import type { Health, LocalStore, MaintenanceTicket, PaymentRecord, PaymentStatus, PropertyDocument, Tenant, UnitActivity, UnitDashboard } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type PropertyTab = "resume" | "logements" | "locataires" | "finances" | "entretien" | "documents" | "historique" | "notes";
type UnitDrawerTab = "resume" | "bail" | "paiements" | "historique" | "documents" | "notes";
type DocumentDrawerTab = "apercu" | "informations" | "historique";
type UnitTenantForm = {
  fullName: string;
  email: string;
  phone: string;
  monthlyRent: string;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus: PaymentStatus;
  notes: string;
};

const tabs: { value: PropertyTab; label: string }[] = [
  { value: "resume", label: "Résumé" },
  { value: "logements", label: "Logements" },
  { value: "locataires", label: "Locataires" },
  { value: "finances", label: "Finances" },
  { value: "entretien", label: "Demandes d'entretien" },
  { value: "documents", label: "Documents" },
  { value: "historique", label: "Historique" },
  { value: "notes", label: "Notes" },
];

const healthLabel: Record<Health, string> = {
  ok: "OK",
  attention: "Attention",
  issue: "Problème",
};

export default function PropertyDetailsPage() {
  const params = useParams<{ id: string }>();
  const { store, setStore } = useLocalStore();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");
  const [activeTab, setActiveTab] = useState<PropertyTab>("resume");
  const [selectedUnit, setSelectedUnit] = useState<UnitDashboard | null>(null);
  const [unitDrawerTab, setUnitDrawerTab] = useState<UnitDrawerTab>("resume");
  const [selectedDocument, setSelectedDocument] = useState<PropertyDocument | null>(null);
  const [documentDrawerTab, setDocumentDrawerTab] = useState<DocumentDrawerTab>("apercu");
  const [tenantAssignmentUnit, setTenantAssignmentUnit] = useState<UnitDashboard | null>(null);
  const [tenantAssignmentForm, setTenantAssignmentForm] = useState<UnitTenantForm>(() => createEmptyUnitTenantForm());
  const [tenantRemovalUnit, setTenantRemovalUnit] = useState<UnitDashboard | null>(null);
  const snapshotStore = snapshot ?? store;

  useEffect(() => {
    let active = true;

    loadPortfolioSnapshot()
      .then((nextSnapshot) => {
        if (!active) {
          return;
        }

        setSnapshot(nextSnapshot);
        setSnapshotError("");
      })
      .catch((error) => {
        console.error("Impossible de charger l'immeuble depuis le snapshot.", error);
        if (active) {
          setSnapshotError("Impossible de synchroniser l'immeuble. Les données locales sont affichées.");
        }
      })
      .finally(() => {
        if (active) {
          setSnapshotLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function refreshPropertySnapshot() {
    try {
      const nextSnapshot = await refreshSnapshot();
      setSnapshot(nextSnapshot);
      setSnapshotError("");
    } catch (error) {
      console.error("Impossible de rafraîchir l'immeuble.", error);
      setSnapshotError("Impossible de rafraîchir l'immeuble. Les données locales sont affichées.");
    }
  }

  const property = useMemo(
    () => getPropertyDashboards(snapshotStore).find((candidate) => candidate.id === params.id) ?? null,
    [params.id, snapshotStore],
  );

  const propertyDocuments = useMemo(
    () => snapshotStore.documents.filter((document) => document.propertyId === params.id),
    [params.id, snapshotStore.documents],
  );
  const propertyTickets = useMemo(
    () => snapshotStore.maintenanceTickets.filter((ticket) => ticket.propertyId === params.id),
    [params.id, snapshotStore.maintenanceTickets],
  );
  const propertyPayments = useMemo(
    () => snapshotStore.payments.filter((payment) => payment.propertyId === params.id),
    [params.id, snapshotStore.payments],
  );
  const propertyActivities = useMemo(
    () => getPropertyActivities(params.id, snapshotStore, 50),
    [params.id, snapshotStore],
  );

  if (!property) {
    return (
      <RouteShell title="Immeuble introuvable" description="L'immeuble demandé n'existe pas dans les données locales.">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
          Retournez à la liste des immeubles pour choisir une propriété existante.
        </div>
      </RouteShell>
    );
  }

  const selectedUnitFromSnapshot = selectedUnit ? property.units.find((unit) => unit.id === selectedUnit.id) ?? selectedUnit : null;
  const occupancyRate = getOccupancyRate(property.units, snapshotStore);
  const currentMonth = propertyPayments.map((payment) => payment.month).sort().at(-1);
  const monthlyPayments = propertyPayments.filter((payment) => payment.month === currentMonth);
  const expectedRent = monthlyPayments.reduce((sum, payment) => sum + payment.amountDue, 0) || property.monthlyRent;
  const receivedRent = monthlyPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const latePayments = monthlyPayments.filter((payment) => payment.status === "en retard");
  const outstandingBalance = monthlyPayments.reduce((sum, payment) => sum + Math.max(0, payment.amountDue - payment.amountPaid), 0);
  const watchedLeases = snapshotStore.leases.filter((lease) => lease.propertyId === property.id && lease.status === "active" && isLeaseWithinDays(lease.endDate, 90)).length;
  const averageRent = Math.round(property.monthlyRent / Math.max(property.units.length, 1));

  function openUnit(unit: UnitDashboard, tab: UnitDrawerTab = "resume") {
    setSelectedUnit(unit);
    setUnitDrawerTab(tab);
  }

  function openTenantAssignment(unit: UnitDashboard) {
    setTenantAssignmentUnit(unit);
    setTenantAssignmentForm(createEmptyUnitTenantForm(unit));
  }

  async function saveTenantAssignment() {
    if (!tenantAssignmentUnit || !isUnitTenantFormValid(tenantAssignmentForm)) {
      return;
    }

    const targetUnit = snapshotStore.units.find((unit) => unit.id === tenantAssignmentUnit.id);

    if (!targetUnit) {
      return;
    }

    setStore(await assignTenantToUnit(snapshotStore, {
      propertyId: targetUnit.propertyId,
      unitId: targetUnit.id,
      fullName: tenantAssignmentForm.fullName,
      email: tenantAssignmentForm.email,
      phone: tenantAssignmentForm.phone,
      monthlyRent: Number(tenantAssignmentForm.monthlyRent),
      leaseStartDate: tenantAssignmentForm.leaseStartDate,
      leaseEndDate: tenantAssignmentForm.leaseEndDate,
      paymentStatus: tenantAssignmentForm.paymentStatus,
      notes: tenantAssignmentForm.notes,
    }));
    await refreshPropertySnapshot();

    setTenantAssignmentUnit(null);
    setSelectedUnit(null);
  }

  async function confirmTenantRemoval() {
    if (!tenantRemovalUnit) {
      setTenantRemovalUnit(null);
      return;
    }

    setStore(await endActiveLeaseForUnit(snapshotStore, tenantRemovalUnit.id));
    await refreshPropertySnapshot();

    setTenantRemovalUnit(null);
    setSelectedUnit(null);
  }

  function openDocument(document: PropertyDocument) {
    setSelectedDocument(document);
    setDocumentDrawerTab("apercu");
  }

  return (
    <RouteShell
      title={property.name}
      description={`${property.address}, ${property.city} · ${property.propertyType} · ${property.units.length} logements`}
    >
      <section className="grid gap-5">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => exportPropertyReport(snapshotStore, property)} type="button">
            Exporter le rapport immeuble
          </button>
        </div>

        {snapshotLoading ? <p className="text-sm text-[var(--muted)]">Synchronisation de l&apos;immeuble...</p> : null}
        {snapshotError ? <p className="text-sm font-semibold text-[color:var(--amber)]">{snapshotError}</p> : null}

        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab.value
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setActiveTab(tab.value)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "resume" ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Metric label="Occupation" value={`${occupancyRate} %`} />
              <Metric label="Nombre de logements" value={formatUnitCount(property.units.length)} />
              <Metric label="Revenus mensuels" value={currency.format(property.monthlyRent)} />
              <Metric label="Loyer moyen" value={currency.format(averageRent)} />
              <Metric label="Baux à surveiller" value={watchedLeases.toString()} />
              <Metric label="Demandes d'entretien ouvertes" value={property.openTicketCount.toString()} />
            </div>
            <TaskComposer onChanged={refreshPropertySnapshot} propertyId={property.id} storeSource={snapshotStore} title={`Créer une tâche personnelle · ${property.name}`} />
          </>
        ) : null}

        {activeTab === "logements" ? (
          <div className="grid gap-3">
            {property.units.map((unit) => (
              <PropertyUnitCard
                key={unit.id}
                occupancy={getUnitOccupancy(unit, snapshotStore.leases, snapshotStore.tenants)}
                onAddTenant={openTenantAssignment}
                onOpenUnit={openUnit}
                onRemoveTenant={setTenantRemovalUnit}
                unit={unit}
              />
            ))}
          </div>
        ) : null}

        {activeTab === "locataires" ? (
          <div className="grid gap-3">
            {property.units.filter((unit) => getActiveTenant(unit)).map((unit) => (
              <ActiveTenantCard
                key={unit.id}
                occupancy={getUnitOccupancy(unit, snapshotStore.leases, snapshotStore.tenants)}
                onOpenUnit={openUnit}
                onRemoveTenant={setTenantRemovalUnit}
                unit={unit}
              />
            ))}
            {property.units.filter((unit) => getActiveTenant(unit)).length === 0 ? <EmptyState label="Aucun locataire actif pour cet immeuble." /> : null}
          </div>
        ) : null}

        {activeTab === "finances" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Metric label="Loyers attendus" value={currency.format(expectedRent)} />
            <Metric label="Loyers reçus ce mois-ci" value={currency.format(receivedRent)} />
            <Metric label="Paiements en retard" value={latePayments.length.toString()} />
            <Metric label="Solde dû" value={currency.format(outstandingBalance)} />
            <Metric label="Taux d'occupation" value={`${occupancyRate} %`} />
          </div>
        ) : null}

        {activeTab === "entretien" ? (
          <div className="grid gap-3">
            {propertyTickets.map((ticket) => (
              <MaintenanceCard key={ticket.id} ticket={ticket} unitLabel={getUnitLabel(property.units, ticket.unitId)} />
            ))}
            {propertyTickets.length === 0 ? <EmptyState label="Aucune demande d'entretien pour cet immeuble." /> : null}
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <div className="grid gap-3">
            {propertyDocuments.map((document) => (
              <button
                key={document.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-2)]"
                onClick={() => openDocument(document)}
                type="button"
              >
                <p className="font-semibold text-[var(--foreground)]">{document.name}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {documentTypeLabel[document.type]} · {getUnitLabel(property.units, document.unitId)} · {formatDate(document.uploadDate)}
                </p>
              </button>
            ))}
            {propertyDocuments.length === 0 ? <EmptyState label="Aucun document pour cet immeuble." /> : null}
          </div>
        ) : null}

        {activeTab === "historique" ? <ActivityTimeline activities={propertyActivities} /> : null}
        {activeTab === "notes" ? (
          <NotesPanel notesSource={snapshotStore.notes} onChanged={refreshPropertySnapshot} propertyId={property.id} targetId={property.id} targetType="immeuble" title={`Notes · ${property.name}`} />
        ) : null}
      </section>

      {selectedUnitFromSnapshot ? (
        <UnitDrawer
          activeTab={unitDrawerTab}
          documents={propertyDocuments.filter((document) => document.unitId === selectedUnitFromSnapshot.id)}
          onDataChanged={refreshPropertySnapshot}
          onClose={() => setSelectedUnit(null)}
          onOpenTenantAssignment={openTenantAssignment}
          onTabChange={setUnitDrawerTab}
          store={snapshotStore}
          unit={selectedUnitFromSnapshot}
        />
      ) : null}

      {tenantAssignmentUnit ? (
        <UnitTenantModal
          form={tenantAssignmentForm}
          onCancel={() => setTenantAssignmentUnit(null)}
          onChange={setTenantAssignmentForm}
          onSave={saveTenantAssignment}
          unit={tenantAssignmentUnit}
        />
      ) : null}

      {tenantRemovalUnit ? (
        <ConfirmModal
          title="Retirer le locataire du logement ?"
          message="Voulez-vous vraiment retirer ce locataire du logement ? Le logement deviendra vacant."
          cancelLabel="Annuler"
          confirmLabel="Retirer le locataire"
          onCancel={() => setTenantRemovalUnit(null)}
          onConfirm={confirmTenantRemoval}
        />
      ) : null}

      {selectedDocument ? (
        <DocumentDrawer
          activeTab={documentDrawerTab}
          document={selectedDocument}
          history={getDocumentHistory(selectedDocument, snapshotStore)}
          onClose={() => setSelectedDocument(null)}
          onTabChange={setDocumentDrawerTab}
          propertyName={property.name}
          unitLabel={getUnitLabel(property.units, selectedDocument.unitId)}
        />
      ) : null}
    </RouteShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function formatUnitCount(count: number) {
  return `${count} logement${count > 1 ? "s" : ""}`;
}

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
      {label}
    </span>
  );
}

function PropertyUnitCard({
  occupancy,
  onAddTenant,
  onOpenUnit,
  onRemoveTenant,
  unit,
}: {
  occupancy: UnitOccupationView;
  onAddTenant: (unit: UnitDashboard) => void;
  onOpenUnit: (unit: UnitDashboard) => void;
  onRemoveTenant: (unit: UnitDashboard) => void;
  unit: UnitDashboard;
}) {
  const occupied = occupancy.isOccupied;

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-2)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--foreground)]">{unit.label}</p>
            <Badge label={occupied ? "Occupé" : "Vacant"} />
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">{unit.floor}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {occupied ? `${occupancy.tenantName} · ` : ""}
            {currency.format(occupancy.monthlyRent)} / mois
            {occupied ? ` · ${paymentStatusLabel[occupancy.paymentStatus]}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => onOpenUnit(unit)} type="button">
            Voir le logement
          </button>
          {occupied ? (
            <button className="btn-danger" onClick={() => onRemoveTenant(unit)} type="button">
              Retirer le locataire
            </button>
          ) : (
            <button className="btn-primary" onClick={() => onAddTenant(unit)} type="button">
              Ajouter un locataire
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ActiveTenantCard({
  occupancy,
  onOpenUnit,
  onRemoveTenant,
  unit,
}: {
  occupancy: UnitOccupationView;
  onOpenUnit: (unit: UnitDashboard) => void;
  onRemoveTenant: (unit: UnitDashboard) => void;
  unit: UnitDashboard;
}) {
  const tenant = getActiveTenant(unit);

  if (!tenant) {
    return null;
  }

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--foreground)]">
            {tenant.firstName} {tenant.lastName}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {unit.label} · {currency.format(occupancy.monthlyRent)} / mois · {paymentStatusLabel[occupancy.paymentStatus]} · Fin du bail: {occupancy.leaseEndDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href={`/locataires?tenant=${tenant.id}`}>
            Voir le locataire
          </Link>
          <button className="btn-secondary" onClick={() => onOpenUnit(unit)} type="button">
            Voir le logement
          </button>
          <button className="btn-danger" onClick={() => onRemoveTenant(unit)} type="button">
            Retirer du logement
          </button>
        </div>
      </div>
    </article>
  );
}

function MaintenanceCard({ ticket, unitLabel }: { ticket: MaintenanceTicket; unitLabel: string }) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--foreground)]">{ticket.title}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{unitLabel} · {ticket.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={ticketPriorityLabel[ticket.priority]} />
          <Badge label={ticketStatusLabel[ticket.status]} />
        </div>
      </div>
    </article>
  );
}

function UnitDrawer({
  activeTab,
  documents,
  onDataChanged,
  onClose,
  onOpenTenantAssignment,
  onTabChange,
  store,
  unit,
}: {
  activeTab: UnitDrawerTab;
  documents: PropertyDocument[];
  onDataChanged: () => void | Promise<void>;
  onClose: () => void;
  onOpenTenantAssignment: (unit: UnitDashboard) => void;
  onTabChange: (tab: UnitDrawerTab) => void;
  store: LocalStore;
  unit: UnitDashboard;
}) {
  const activities = [...unit.activities].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));
  const tenant = getActiveTenant(unit);
  const occupancy = getUnitOccupancy(unit, store.leases, store.tenants);

  return (
    <DrawerFrame title={unit.label} subtitle={unit.floor} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1 sm:grid-cols-3">
        {(["resume", "bail", "paiements", "historique", "documents", "notes"] as UnitDrawerTab[]).map((tab) => (
          <TabButton key={tab} active={activeTab === tab} onClick={() => onTabChange(tab)}>
            {tab === "resume" ? "Résumé" : tab === "paiements" ? "Paiements" : tab === "historique" ? "Historique" : tab === "documents" ? "Documents" : tab === "notes" ? "Notes" : "Bail"}
          </TabButton>
        ))}
      </div>

      {activeTab === "resume" ? (
        <div className="mt-6 grid gap-3">
          {!occupancy.isOccupied ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-5">
              <p className="text-lg font-semibold text-[var(--foreground)]">Ce logement est vacant</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Ajoutez un locataire directement ici pour remplir le logement et créer le bail initial.
              </p>
              <button className="btn-primary mt-4" onClick={() => onOpenTenantAssignment(unit)} type="button">
                Ajouter un locataire
              </button>
            </div>
          ) : (
            <InfoCard label="Locataire" value={occupancy.tenantName} />
          )}
          <InfoCard label="Loyer" value={`${currency.format(occupancy.monthlyRent)} / mois`} />
          <InfoCard label="Statut" value={healthLabel[unit.health]} />
          <InfoCard label="Demandes d'entretien ouvertes" value={unit.openTickets.length.toString()} />
          {tenant ? (
            <TaskComposer
              compact
              onChanged={onDataChanged}
              propertyId={unit.propertyId}
              storeSource={store}
              tenantId={tenant.id}
              title={`Créer une tâche personnelle · ${unit.label}`}
              unitId={unit.id}
            />
          ) : null}
        </div>
      ) : null}
      {activeTab === "bail" ? (
        <div className="mt-6 grid gap-3">
          <InfoCard label="Début du bail" value={occupancy.leaseStartDate} />
          <InfoCard label="Fin du bail" value={occupancy.leaseEndDate} />
          <InfoCard label="Loyer" value={`${currency.format(occupancy.monthlyRent)} / mois`} />
          <InfoCard label="Notes" value={unit.notes} />
        </div>
      ) : null}
      {activeTab === "paiements" ? <PaymentList payments={unit.payments} /> : null}
      {activeTab === "historique" ? <ActivityTimeline activities={activities} /> : null}
      {activeTab === "documents" ? (
        <div className="mt-6 grid gap-3">
          {documents.map((document) => (
            <InfoCard key={document.id} label={documentTypeLabel[document.type]} value={document.name} />
          ))}
          {documents.length === 0 ? <EmptyState label="Aucun document associé à ce logement." /> : null}
        </div>
      ) : null}
      {activeTab === "notes" ? (
        <div className="mt-6">
          <NotesPanel
            notesSource={store.notes}
            onChanged={onDataChanged}
            propertyId={unit.propertyId}
            targetId={unit.id}
            targetType="logement"
            tenantId={unit.tenantId}
            title={`Notes · ${unit.label}`}
            unitId={unit.id}
          />
        </div>
      ) : null}
    </DrawerFrame>
  );
}

function UnitTenantModal({
  form,
  onCancel,
  onChange,
  onSave,
  unit,
}: {
  form: UnitTenantForm;
  onCancel: () => void;
  onChange: (form: UnitTenantForm) => void;
  onSave: () => void;
  unit: UnitDashboard;
}) {
  const canSave = isUnitTenantFormValid(form);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Logement vacant</p>
            <h2 className="mt-1 text-2xl font-semibold">Ajouter un locataire au {unit.label}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{unit.floor}</p>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <TextInput label="Nom complet" value={form.fullName} onChange={(fullName) => onChange({ ...form, fullName })} />
          <TextInput label="Courriel" type="email" value={form.email} onChange={(email) => onChange({ ...form, email })} />
          <TextInput label="Téléphone" value={form.phone} onChange={(phone) => onChange({ ...form, phone })} />
          <TextInput label="Loyer mensuel" type="number" value={form.monthlyRent} onChange={(monthlyRent) => onChange({ ...form, monthlyRent })} />
          <TextInput label="Date de début du bail" type="date" value={form.leaseStartDate} onChange={(leaseStartDate) => onChange({ ...form, leaseStartDate })} />
          <TextInput label="Date de fin du bail" type="date" value={form.leaseEndDate} onChange={(leaseEndDate) => onChange({ ...form, leaseEndDate })} />
          <SelectField label="Statut paiement" value={form.paymentStatus} onChange={(paymentStatus) => onChange({ ...form, paymentStatus: paymentStatus as PaymentStatus })}>
            <option value="paid">Payé</option>
            <option value="dueSoon">Dû bientôt</option>
            <option value="late">En retard</option>
          </SelectField>
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)] md:col-span-2">
            Notes optionnelles
            <textarea
              className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              value={form.notes}
              onChange={(event) => onChange({ ...form, notes: event.target.value })}
            />
          </label>
        </div>

        <p className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
          Le locataire sera assigné uniquement si le logement est encore vacant au moment de l&apos;enregistrement.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" disabled={!canSave} onClick={onSave} type="button">
            Enregistrer le locataire
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  cancelLabel,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  cancelLabel: string;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="btn-danger" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentDrawer({
  activeTab,
  document,
  history,
  onClose,
  onTabChange,
  propertyName,
  unitLabel,
}: {
  activeTab: DocumentDrawerTab;
  document: PropertyDocument;
  history: UnitActivity[];
  onClose: () => void;
  onTabChange: (tab: DocumentDrawerTab) => void;
  propertyName: string;
  unitLabel: string;
}) {
  return (
    <DrawerFrame title={document.name} subtitle={documentTypeLabel[document.type]} onClose={onClose}>
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1">
        {(["apercu", "informations", "historique"] as DocumentDrawerTab[]).map((tab) => (
          <TabButton key={tab} active={activeTab === tab} onClick={() => onTabChange(tab)}>
            {tab === "apercu" ? "Aperçu" : tab === "informations" ? "Informations" : "Historique"}
          </TabButton>
        ))}
      </div>
      {activeTab === "apercu" ? (
        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
          <p className="font-semibold text-[var(--foreground)]">{document.name}</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{document.mimeType || documentTypeLabel[document.type]}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <DocumentFileActions document={document} />
          </div>
        </div>
      ) : null}
      {activeTab === "informations" ? (
        <div className="mt-6 grid gap-3">
          <InfoCard label="Nom du document" value={document.name} />
          <InfoCard label="Type" value={documentTypeLabel[document.type]} />
          <InfoCard label="Immeuble" value={propertyName} />
          <InfoCard label="Logement" value={unitLabel} />
          <InfoCard label="Entité liée" value={document.relatedEntityType ?? "Aucune"} />
          <InfoCard label="Date de téléversement" value={formatDate(document.uploadDate)} />
          <InfoCard label="Taille" value={formatFileSize(document.size)} />
        </div>
      ) : null}
      {activeTab === "historique" ? <ActivityTimeline activities={history} /> : null}
    </DrawerFrame>
  );
}

function DrawerFrame({ children, onClose, subtitle, title }: { children: React.ReactNode; onClose: () => void; subtitle: string; title: string }) {
  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/55" aria-label="Fermer le panneau" onClick={onClose} type="button" />
      <aside className="custom-scrollbar absolute right-0 top-0 h-full w-full max-w-[480px] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-[-24px_0_60px_rgba(0,0,0,0.32)] sm:w-[460px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--muted)]">{subtitle}</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-[var(--foreground)]">{title}</h2>
          </div>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]" onClick={onClose} type="button">
            ×
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button className={`rounded-md px-3 py-2 text-sm font-semibold transition ${active ? "bg-[color:var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]"}`} onClick={onClick} type="button">
      {children}
    </button>
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

function SelectField({
  children,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
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
        {children}
      </select>
    </label>
  );
}

function PaymentList({ payments }: { payments: PaymentRecord[] }) {
  const sorted = [...payments].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="mt-6 grid gap-3">
      {sorted.map((payment) => (
        <div key={payment.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="font-semibold text-[var(--foreground)]">{payment.month}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {rentPaymentStatusLabel[payment.status]} · {currency.format(payment.amountPaid)} / {currency.format(payment.amountDue)}
          </p>
        </div>
      ))}
      {sorted.length === 0 ? <EmptyState label="Aucun paiement." /> : null}
    </div>
  );
}

function ActivityTimeline({ activities }: { activities: UnitActivity[] }) {
  if (activities.length === 0) {
    return <EmptyState label="Aucun historique pour cet immeuble." />;
  }

  return (
    <ol className="grid gap-3">
      {activities.map((activity) => (
        <li key={activity.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="font-semibold text-[var(--foreground)]">{activity.title}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-[var(--muted)]">{formatDate(activity.date)}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{activity.description}</p>
        </li>
      ))}
    </ol>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
      {label}
    </div>
  );
}

function getOccupancyRate(units: UnitDashboard[], store: LocalStore) {
  if (units.length === 0) {
    return 0;
  }

  return Math.round((units.filter((unit) => getUnitOccupancy(unit, store.leases, store.tenants).isOccupied).length / units.length) * 100);
}

function getUnitLabel(units: { id: string; label: string }[], unitId: string) {
  return units.find((unit) => unit.id === unitId)?.label ?? "Logement";
}

function getDocumentHistory(document: PropertyDocument, store: { activities: UnitActivity[] }) {
  return store.activities
    .filter((activity) => activity.type === "document" && activity.description.toLowerCase().includes(document.name.toLowerCase()))
    .sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));
}

function getActiveTenant(unit: UnitDashboard) {
  return isRealTenant(unit.tenant) ? unit.tenant : null;
}

function isRealTenant(tenant: Tenant | null) {
  if (!tenant) {
    return false;
  }

  const fullName = `${tenant.firstName} ${tenant.lastName}`.trim().toLowerCase();
  return fullName !== "" && fullName !== "vacant";
}

function createEmptyUnitTenantForm(unit?: UnitDashboard): UnitTenantForm {
  return {
    fullName: "",
    email: "",
    phone: "",
    monthlyRent: unit?.monthlyRent ? unit.monthlyRent.toString() : "",
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    paymentStatus: "dueSoon",
    notes: "",
  };
}

function isUnitTenantFormValid(form: UnitTenantForm) {
  return Boolean(form.fullName.trim() && Number(form.monthlyRent) > 0);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function isLeaseWithinDays(date: string, days: number) {
  const now = new Date();
  const targetDate = new Date(`${date}T12:00:00`);
  const daysUntilDate = Math.ceil((targetDate.getTime() - now.getTime()) / 86_400_000);

  return daysUntilDate >= 0 && daysUntilDate <= days;
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

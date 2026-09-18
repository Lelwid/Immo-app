"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { NotesPanel } from "@/components/NotesPanel";
import { TaskComposer } from "@/components/TaskComposer";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { getUnitOccupancy, type UnitOccupationView } from "@/lib/data/leaseAdapters";
import {
  archiveTenantAndEndActiveLeases,
  assignTenantToUnit,
  getCurrentUnitForTenant,
  isUnitAvailableForLease,
  updateTenantProfile,
} from "@/lib/data/leaseAssignmentService";
import { getTodayIsoDate, type InitialPaymentStatus } from "@/lib/data/paymentSideEffectsService";
import { buildRentLedger, type RentChargeRow } from "@/lib/data/rentLedgerService";
import {
  createTenantPortalInvitation,
  disableTenantPortalAccess,
  getTenantPortalAccessForTenant,
  type TenantPortalInvitation,
  TenantPortalInvitationError,
} from "@/lib/data/tenantPortalService";
import { currency, getPropertyName, rentPaymentStatusLabel } from "@/lib/mockData";
import type { LocalStore, PaymentRecord, Tenant, Unit } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type TenantDrawerTab = "resume" | "bail" | "paiements" | "documents" | "historique" | "notes";
type TenantForm = Pick<Tenant, "firstName" | "lastName" | "email" | "phone">;
type NewTenantForm = {
  fullName: string;
  email: string;
  phone: string;
  propertyId: string;
  unitId: string;
  monthlyRent: string;
  leaseStartDate: string;
  leaseEndDate: string;
  paymentStatus: InitialPaymentStatus;
  initialAmountPaid: string;
  paymentReceivedDate: string;
  notes: string;
};

type TenantRow = {
  tenant: Tenant;
  unit: Unit | null;
  occupancy: UnitOccupationView | null;
  propertyName: string;
  rentStatus: TenantRentStatusSummary;
  documentsCount: number;
};

type TenantRentStatus = "late" | "partial" | "dueSoon" | "upcoming" | "paid" | "paidAdvance" | "none";

type TenantRentStatusSummary = {
  charge: RentChargeRow | null;
  label: string;
  status: TenantRentStatus;
};

const tenantTabs: { label: string; value: TenantDrawerTab }[] = [
  { label: "Résumé", value: "resume" },
  { label: "Bail", value: "bail" },
  { label: "Paiements", value: "paiements" },
  { label: "Documents", value: "documents" },
  { label: "Historique", value: "historique" },
  { label: "Notes", value: "notes" },
];

export default function LocatairesPage() {
  return (
    <Suspense fallback={null}>
      <LocatairesContent />
    </Suspense>
  );
}

function LocatairesContent() {
  const { store, setStore } = useLocalStore();
  const searchParams = useSearchParams();
  const { data, error: snapshotError, loading: snapshotLoading, refresh: refreshSnapshot } = usePortfolioSnapshot();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => searchParams.get("tenant"));
  const [activeTab, setActiveTab] = useState<TenantDrawerTab>("resume");
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [showCreateTenantModal, setShowCreateTenantModal] = useState(false);
  const [newTenantError, setNewTenantError] = useState("");
  const [newTenantSaving, setNewTenantSaving] = useState(false);
  const newTenantSaveInFlightRef = useRef(false);
  const [newTenantForm, setNewTenantForm] = useState<NewTenantForm>(() => createEmptyTenantForm(store));
  const snapshotStore = data ?? emptyPortfolioStore;
  const rows = useMemo(() => getTenantRows(snapshotStore), [snapshotStore]);
  const summary = useMemo(() => getTenantSummary(snapshotStore), [snapshotStore]);
  const selectedTenant = snapshotStore.tenants.find((tenant) => tenant.id === selectedTenantId) ?? null;

  async function refreshTenantSnapshot() {
    try {
      await refreshSnapshot();
    } catch (error) {
      console.error("Impossible de rafraîchir les locataires.", error);
    }
  }

  function openTenant(tenant: Tenant, tab: TenantDrawerTab = "resume") {
    setSelectedTenantId(tenant.id);
    setActiveTab(tab);
  }

  function openCreateTenantModal() {
    setNewTenantForm(createEmptyTenantForm(snapshotStore));
    setNewTenantError("");
    setShowCreateTenantModal(true);
  }

  async function saveNewTenant() {
    if (newTenantSaveInFlightRef.current || !isNewTenantFormValid(newTenantForm)) {
      return;
    }

    newTenantSaveInFlightRef.current = true;
    setNewTenantSaving(true);
    setNewTenantError("");

    try {
      const nextStore = await assignTenantToUnit(snapshotStore, {
        propertyId: newTenantForm.propertyId,
        unitId: newTenantForm.unitId,
        fullName: newTenantForm.fullName,
        email: newTenantForm.email,
        phone: newTenantForm.phone,
        monthlyRent: Number(newTenantForm.monthlyRent),
        leaseStartDate: newTenantForm.leaseStartDate,
        leaseEndDate: newTenantForm.leaseEndDate,
        paymentStatus: newTenantForm.paymentStatus,
        initialAmountPaid: Number(newTenantForm.initialAmountPaid),
        paymentReceivedDate: newTenantForm.paymentReceivedDate,
        notes: newTenantForm.notes,
      });

      setStore(nextStore);
      await refreshTenantSnapshot();
      setShowCreateTenantModal(false);
    } catch (error) {
      console.error("Impossible d'ajouter le locataire.", error);
      setNewTenantError(error instanceof Error ? error.message : "Impossible d’ajouter le locataire et son bail. Réessayez.");
    } finally {
      newTenantSaveInFlightRef.current = false;
      setNewTenantSaving(false);
    }
  }

  async function saveTenant(form: TenantForm) {
    if (!editingTenant) {
      return;
    }

    setStore(await updateTenantProfile(snapshotStore, editingTenant.id, form));
    await refreshTenantSnapshot();

    setEditingTenant(null);
  }

  async function deleteTenant() {
    if (!tenantToDelete) {
      return;
    }

    setStore(await archiveTenantAndEndActiveLeases(snapshotStore, tenantToDelete.id));
    await refreshTenantSnapshot();

    if (selectedTenantId === tenantToDelete.id) {
      setSelectedTenantId(null);
    }

    setTenantToDelete(null);
  }

  return (
    <RouteShell title="Locataires" description="Gestion indépendante des locataires, baux, paiements et documents associés.">
      <section className="grid gap-5">
        {!data ? (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-sm font-semibold text-[var(--muted)]">
              {snapshotLoading ? "Chargement des locataires..." : "Impossible de charger les données du portefeuille."}
            </p>
            {snapshotError ? <p className="mt-2 text-sm text-[color:var(--yellow)]">{snapshotError}</p> : null}
            {snapshotError ? (
              <button className="btn-secondary mt-4" onClick={() => void refreshSnapshot()} type="button">
                Réessayer
              </button>
            ) : null}
          </section>
        ) : null}

        {data ? (
          <>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Locataires actifs" value={summary.activeTenants.toString()} />
          <Metric label="Locataires en retard" value={summary.lateTenants.toString()} />
          <Metric label="Baux actifs" value={summary.activeLeases.toString()} />
          <Metric label="Logements vacants" value={summary.vacantUnits.toString()} />
        </div>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">Répertoire des locataires</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{rows.length} locataires au portefeuille</p>
            </div>
            <button className="btn-primary" onClick={openCreateTenantModal} type="button">
              Ajouter un locataire
            </button>
          </div>

          <div className="custom-scrollbar overflow-x-auto rounded-lg border border-[var(--border)]">
            <div className="min-w-[1180px]">
              <div className="grid grid-cols-[1.2fr_1.1fr_0.8fr_0.7fr_0.8fr_0.8fr_1.2fr] gap-3 bg-[var(--surface-2)] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)]">
                <span>Nom</span>
                <span>Immeuble</span>
                <span>Logement</span>
                <span>Loyer</span>
                <span>Statut paiement</span>
                <span>Fin du bail</span>
                <span>Téléphone / courriel</span>
              </div>
              {rows.map((row) => (
                <button
                  key={row.tenant.id}
                  aria-label={`Ouvrir le locataire: ${row.tenant.firstName} ${row.tenant.lastName}`}
                  className="group grid w-full cursor-pointer grid-cols-[1.2fr_1.1fr_0.8fr_0.7fr_0.8fr_0.8fr_1.2fr] gap-3 border-t border-[var(--border)] px-4 py-3 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--accent)]"
                  onClick={() => openTenant(row.tenant)}
                  type="button"
                >
                  <span className="inline-flex items-start justify-between gap-2 font-semibold transition group-hover:text-[color:var(--accent)]">
                    {row.tenant.firstName} {row.tenant.lastName}
                    <span className="text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)]" aria-hidden="true">
                      →
                    </span>
                  </span>
                  <span className="text-[var(--muted)]">{row.propertyName}</span>
                  <span>{row.occupancy?.unitName ?? "Non assigné"}</span>
                  <span>{row.occupancy ? currency.format(row.occupancy.monthlyRent) : "—"}</span>
                  <span><TenantRentStatusBadge summary={row.rentStatus} /></span>
                  <span>{row.occupancy?.leaseEndDate ?? "—"}</span>
                  <span className="text-[var(--muted)]">
                    {row.tenant.phone}
                    <br />
                    {row.tenant.email}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
          </>
        ) : null}
      </section>

      {data && selectedTenant ? (
        <TenantDrawer
          activeTab={activeTab}
          onClose={() => setSelectedTenantId(null)}
          onDelete={setTenantToDelete}
          onEdit={setEditingTenant}
          onTabChange={setActiveTab}
          onDataChanged={refreshTenantSnapshot}
          store={snapshotStore}
          tenant={selectedTenant}
        />
      ) : null}

      {data && editingTenant ? (
        <TenantFormModal
          tenant={editingTenant}
          onCancel={() => setEditingTenant(null)}
          onSave={saveTenant}
        />
      ) : null}

      {data && showCreateTenantModal ? (
        <NewTenantModal
          error={newTenantError}
          form={newTenantForm}
          onCancel={() => setShowCreateTenantModal(false)}
          onChange={setNewTenantForm}
          onSave={saveNewTenant}
          saving={newTenantSaving}
          store={snapshotStore}
        />
      ) : null}

      {data && tenantToDelete ? (
        <ConfirmModal
          title="Archiver le locataire ?"
          message="Voulez-vous vraiment archiver ce locataire ? Ses baux actifs seront terminés, le logement deviendra vacant et l'historique sera conservé."
          cancelLabel="Annuler"
          confirmLabel="Oui, archiver"
          onCancel={() => setTenantToDelete(null)}
          onConfirm={deleteTenant}
        />
      ) : null}
    </RouteShell>
  );
}

function TenantDrawer({
  activeTab,
  onDataChanged,
  onClose,
  onDelete,
  onEdit,
  onTabChange,
  store,
  tenant,
}: {
  activeTab: TenantDrawerTab;
  onDataChanged: () => void | Promise<void>;
  onClose: () => void;
  onDelete: (tenant: Tenant) => void;
  onEdit: (tenant: Tenant) => void;
  onTabChange: (tab: TenantDrawerTab) => void;
  store: LocalStore;
  tenant: Tenant;
}) {
  const unit = getCurrentUnitForTenant(tenant.id, store);
  const occupancy = unit ? getUnitOccupancy(unit, store.leases, store.tenants) : null;
  const payments = store.payments
    .filter((payment) => payment.tenantId === tenant.id || payment.unitId === unit?.id)
    .sort((a, b) => b.month.localeCompare(a.month));
  const documents = getTenantDocuments(tenant, unit, store);
  const activities = store.activities
    .filter((activity) => activity.tenantId === tenant.id || (unit ? activity.unitId === unit.id : false))
    .sort((a, b) => (b.createdAt ?? `${b.date}T12:00:00`).localeCompare(a.createdAt ?? `${a.date}T12:00:00`));
  const propertyName = unit ? getPropertyName(unit.propertyId, store) : "Non assigné";

  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-black/55" aria-label="Fermer le panneau" onClick={onClose} type="button" />
      <aside className="custom-scrollbar absolute right-0 top-0 h-full w-full max-w-[480px] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-[-24px_0_60px_rgba(0,0,0,0.32)] sm:w-[460px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">Dossier locataire</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
              {tenant.firstName} {tenant.lastName}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {propertyName} · {occupancy?.unitName ?? "Aucun logement"}
            </p>
          </div>
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {tenantTabs.map((tab) => (
            <button
              key={tab.value}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === tab.value
                  ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => onTabChange(tab.value)}
              type="button"
            >
              <AppIcon name={getTenantDrawerTabIcon(tab.value)} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === "resume" ? <TenantSummaryTab onDataChanged={onDataChanged} occupancy={occupancy} store={store} tenant={tenant} unit={unit} /> : null}
          {activeTab === "bail" ? <TenantLeaseTab occupancy={occupancy} store={store} unit={unit} /> : null}
          {activeTab === "paiements" ? <TenantPaymentsTab payments={payments} /> : null}
          {activeTab === "documents" ? <TenantDocumentsTab documents={documents} propertyName={propertyName} unit={unit} /> : null}
          {activeTab === "historique" ? <TenantHistoryTab activities={activities} store={store} /> : null}
          {activeTab === "notes" ? (
            <NotesPanel
              notesSource={store.notes}
              onChanged={onDataChanged}
              propertyId={unit?.propertyId ?? store.properties[0]?.id ?? ""}
              targetId={tenant.id}
              targetType="locataire"
              tenantId={tenant.id}
              title={`Notes · ${tenant.firstName} ${tenant.lastName}`}
              unitId={unit?.id}
            />
          ) : null}
        </div>

        <div className="mt-6 grid gap-2 border-t border-[var(--border)] pt-5">
          <button className="btn-primary" onClick={() => onEdit(tenant)} type="button">
            Modifier le locataire
          </button>
          <button className="btn-secondary" onClick={() => onTabChange("notes")} type="button">
            Ajouter une note
          </button>
          {unit ? (
            <Link className="btn-secondary text-center" href={`/dashboard?property=${unit.propertyId}&unit=${unit.id}&tab=resume`}>
              Voir le logement
            </Link>
          ) : null}
          <button className="btn-danger" onClick={() => onDelete(tenant)} type="button">
            Supprimer
          </button>
        </div>
      </aside>
    </div>
  );
}

function getTenantDrawerTabIcon(tab: TenantDrawerTab): IconName {
  const icons: Record<TenantDrawerTab, IconName> = {
    resume: "layout-dashboard",
    bail: "file-text",
    paiements: "credit-card",
    documents: "folder-open",
    historique: "history",
    notes: "sticky-note",
  };
  return icons[tab];
}

function TenantSummaryTab({
  onDataChanged,
  occupancy,
  store,
  tenant,
  unit,
}: {
  onDataChanged: () => void | Promise<void>;
  occupancy: UnitOccupationView | null;
  store: LocalStore;
  tenant: Tenant;
  unit: Unit | null;
}) {
  const rentStatus = getTenantRentStatus(tenant.id, store);

  return (
    <div className="grid gap-3">
      <InfoCard label="Locataire" value={`${tenant.firstName} ${tenant.lastName}`} />
      <InfoCard label="Téléphone" value={tenant.phone || "Non renseigné"} />
      <InfoCard label="Courriel" value={tenant.email || "Non renseigné"} />
      <InfoCard label="Immeuble" value={unit ? getPropertyName(unit.propertyId, store) : "Non assigné"} />
      <InfoCard label="Logement" value={occupancy?.unitName ?? "Aucun logement"} />
      <InfoCard label="Loyer" value={occupancy ? `${currency.format(occupancy.monthlyRent)} / mois` : "—"} />
      <InfoCard label="Statut paiement" value={rentStatus.label} />
      <TenantPortalAccessPanel tenant={tenant} />
      <TaskComposer
        compact
        onChanged={onDataChanged}
        propertyId={unit?.propertyId ?? store.properties[0]?.id}
        storeSource={store}
        tenantId={tenant.id}
        title={`Créer une tâche personnelle · ${tenant.firstName} ${tenant.lastName}`}
        unitId={unit?.id}
      />
    </div>
  );
}

function TenantPortalAccessPanel({ tenant }: { tenant: Tenant }) {
  const [email, setEmail] = useState(tenant.email);
  const [invitation, setInvitation] = useState<TenantPortalInvitation | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("Chargement...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    const resetTimer = window.setTimeout(() => {
      if (ignore) {
        return;
      }

      setEmail(tenant.email);
      setMessage("");
      setStatus("Chargement...");
      setInvitation(null);
    }, 0);

    getTenantPortalAccessForTenant(tenant.id)
      .then((access) => {
        if (ignore) {
          return;
        }

        setStatus(access.accountStatus);
        setInvitation(access.invitation);
      })
      .catch((error) => {
        if (ignore) {
          return;
        }

        console.error("Impossible de charger l'accès portail locataire.", error);
        setStatus("Non invité");
      });

    return () => {
      ignore = true;
      window.clearTimeout(resetTimer);
    };
  }, [tenant.email, tenant.id]);

  async function inviteTenant() {
    if (!email.trim()) {
      setMessage("Ajoutez un courriel avant d'envoyer l'invitation.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const result = await createTenantPortalInvitation(tenant, email);
      setInvitation(result.invitation);
      setStatus("Invitation envoyée");
      setMessage(result.emailSent ? "Invitation envoyée par courriel. Elle expire dans 14 jours." : "Invitation simulée en mode local.");
    } catch (error) {
      console.error("Impossible d'inviter le locataire au portail.", error);
      setMessage(
        error instanceof TenantPortalInvitationError && error.code === "EMAIL_NOT_CONFIGURED"
          ? "L’envoi des invitations par courriel doit être configuré pour cet environnement."
          : error instanceof TenantPortalInvitationError
            ? error.message
            : "Impossible de créer l'invitation au portail.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function disableAccess() {
    setLoading(true);
    setMessage("");

    try {
      await disableTenantPortalAccess(tenant.id);
      setStatus("Non invité");
      setMessage("Accès locataire désactivé.");
    } catch (error) {
      console.error("Impossible de désactiver l'accès portail locataire.", error);
      setMessage("Impossible de désactiver l'accès locataire.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-[var(--muted)]">Portail locataire</p>
          <p className="mt-1 font-semibold text-[var(--foreground)]">{status}</p>
          {invitation ? <p className="mt-1 text-xs text-[var(--muted)]">Invitation: {invitation.email}</p> : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <input
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
          placeholder="courriel@exemple.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={inviteTenant} type="button">
          {status === "Invitation envoyée" ? "Renvoyer l’invitation" : "Inviter au portail"}
        </button>
        {status === "Actif" ? (
          <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={disableAccess} type="button">
            Désactiver l’accès
          </button>
        ) : null}
      </div>
      {message ? <p className="mt-2 text-xs text-[var(--muted)]">{message}</p> : null}
    </section>
  );
}

function TenantLeaseTab({ occupancy, store, unit }: { occupancy: UnitOccupationView | null; store: LocalStore; unit: Unit | null }) {
  if (!unit || !occupancy) {
    return <EmptyState text="Ce locataire n’est associé à aucun bail actif." />;
  }

  const rentStatus = getTenantRentStatus(occupancy.tenantId, store);

  return (
    <div className="grid gap-3">
      <InfoCard label="Logement" value={occupancy.unitName} />
      <InfoCard label="Début du bail" value={occupancy.leaseStartDate} />
      <InfoCard label="Fin du bail" value={occupancy.leaseEndDate} />
      <InfoCard label="Loyer" value={`${currency.format(occupancy.monthlyRent)} / mois`} />
      <InfoCard label="Statut paiement" value={rentStatus.label} />
      <InfoCard label="Notes" value={unit.notes || "Aucune note."} />
    </div>
  );
}
function TenantPaymentsTab({ payments }: { payments: PaymentRecord[] }) {
  if (payments.length === 0) {
    return <EmptyState text="Aucun paiement associé à ce locataire." />;
  }

  return (
    <div className="grid gap-3">
      {payments.map((payment) => (
        <div key={payment.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[var(--foreground)]">{payment.month}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {currency.format(payment.amountPaid)} / {currency.format(payment.amountDue)}
              </p>
            </div>
            <RentPaymentBadge status={payment.status} />
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">Date prévue: {payment.dueDate}</p>
          <p className="text-sm text-[var(--muted)]">Paiement: {payment.paidAt || "Non reçu"}</p>
        </div>
      ))}
    </div>
  );
}

function TenantDocumentsTab({
  documents,
  propertyName,
  unit,
}: {
  documents: LocalStore["documents"];
  propertyName: string;
  unit: Unit | null;
}) {
  if (documents.length === 0) {
    return <EmptyState text="Aucun document associé à ce locataire." />;
  }

  return (
    <div className="grid gap-3">
      {documents.map((document) => (
        <Link
          key={document.id}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)]"
          href={`/documents?document=${document.id}`}
        >
          <p className="font-semibold text-[var(--foreground)]">{document.name}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {propertyName} · {unit?.label ?? "Aucun logement"} · {document.uploadDate}
          </p>
        </Link>
      ))}
    </div>
  );
}

function TenantHistoryTab({ activities, store }: { activities: LocalStore["activities"]; store: LocalStore }) {
  if (activities.length === 0) {
    return <EmptyState text="Aucun historique pour ce locataire." />;
  }

  return (
    <div className="grid gap-3">
      {activities.map((activity) => (
        <div key={activity.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
              {activity.type}
            </span>
            <span className="text-xs font-semibold text-[var(--muted)]">{activity.date}</span>
          </div>
          <p className="mt-3 font-semibold text-[var(--foreground)]">{activity.title}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{activity.description}</p>
          <p className="mt-2 text-xs font-medium text-[var(--muted)]">
            {activity.propertyId ? getPropertyName(activity.propertyId, store) : "Portefeuille"}
          </p>
        </div>
      ))}
    </div>
  );
}

function NewTenantModal({
  error,
  form,
  onCancel,
  onChange,
  onSave,
  saving,
  store,
}: {
  error: string;
  form: NewTenantForm;
  onCancel: () => void;
  onChange: (form: NewTenantForm) => void;
  onSave: () => void;
  saving: boolean;
  store: LocalStore;
}) {
  const selectedProperty = store.properties.find((property) => property.id === form.propertyId) ?? null;
  const availableUnits = store.units.filter((unit) => unit.propertyId === form.propertyId && isUnitAvailableForLease(store, unit.id));
  const canSave = isNewTenantFormValid(form) && availableUnits.some((unit) => unit.id === form.unitId);

  function updateProperty(propertyId: string) {
    const firstVacantUnit = store.units.find((unit) => unit.propertyId === propertyId && isUnitAvailableForLease(store, unit.id));
    onChange({ ...form, propertyId, unitId: firstVacantUnit?.id ?? "" });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Locataires</p>
            <h2 className="mt-1 text-2xl font-semibold">Nouveau locataire</h2>
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
          <SelectField label="Immeuble" value={form.propertyId} onChange={updateProperty}>
            {store.properties.length === 0 ? <option value="">Aucun immeuble disponible</option> : null}
            {store.properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Logement"
            value={form.unitId}
            onChange={(unitId) => onChange({ ...form, unitId })}
            disabled={!selectedProperty || availableUnits.length === 0}
          >
            {availableUnits.length === 0 ? <option value="">Aucun logement vacant</option> : null}
            {availableUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label} · {unit.floor}
              </option>
            ))}
          </SelectField>
          <TextInput label="Date de début du bail" type="date" value={form.leaseStartDate} onChange={(leaseStartDate) => onChange({ ...form, leaseStartDate })} />
          <TextInput label="Date de fin du bail" type="date" value={form.leaseEndDate} onChange={(leaseEndDate) => onChange({ ...form, leaseEndDate })} />
          <SelectField
            label="Statut paiement"
            value={form.paymentStatus}
            onChange={(paymentStatus) => onChange(updateNewTenantPaymentStatus(form, paymentStatus as InitialPaymentStatus))}
          >
            <option value="paid">Payé</option>
            <option value="partial">Partiel</option>
            <option value="dueSoon">Dû bientôt</option>
            <option value="late">En retard</option>
          </SelectField>
          {form.paymentStatus === "partial" ? (
            <TextInput
              label="Montant reçu"
              type="number"
              value={form.initialAmountPaid}
              onChange={(initialAmountPaid) => onChange({ ...form, initialAmountPaid })}
            />
          ) : null}
          {form.paymentStatus === "paid" || form.paymentStatus === "partial" ? (
            <TextInput
              label="Date de réception du paiement"
              type="date"
              value={form.paymentReceivedDate}
              onChange={(paymentReceivedDate) => onChange({ ...form, paymentReceivedDate })}
            />
          ) : null}
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)] md:col-span-2">
            Notes optionnelles
            <textarea
              className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              value={form.notes}
              onChange={(event) => onChange({ ...form, notes: event.target.value })}
            />
          </label>
        </div>

        {selectedProperty && availableUnits.length === 0 ? (
          <p className="mt-4 rounded-md border border-[color:var(--yellow)]/30 bg-[color:var(--yellow)]/10 p-3 text-sm text-[color:var(--yellow)]">
            Tous les logements de cet immeuble sont déjà occupés. Choisissez un autre immeuble ou libérez un logement avant d&apos;assigner un locataire.
          </p>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">Seuls les logements vacants sont affichés pour éviter une assignation accidentelle.</p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" disabled={saving} onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-40" disabled={!canSave || saving} onClick={onSave} type="button">
            {saving ? "Enregistrement…" : "Enregistrer le locataire"}
          </button>
        </div>
        {error ? <p className="mt-4 text-sm font-semibold text-[color:var(--red)]" role="alert">{error}</p> : null}
      </div>
    </div>
  );
}

function TenantFormModal({
  onCancel,
  onSave,
  tenant,
}: {
  onCancel: () => void;
  onSave: (form: TenantForm) => void;
  tenant: Tenant;
}) {
  const [form, setForm] = useState<TenantForm>({
    firstName: tenant.firstName,
    lastName: tenant.lastName,
    email: tenant.email,
    phone: tenant.phone,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <h2 className="text-2xl font-semibold">Modifier le locataire</h2>
        <div className="mt-5 grid gap-3">
          <TextInput label="Prénom" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
          <TextInput label="Nom" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
          <TextInput label="Courriel" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <TextInput label="Téléphone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary" onClick={onCancel} type="button">
              Annuler
            </button>
            <button className="btn-primary" onClick={() => onSave(form)} type="button">
              Enregistrer
            </button>
          </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[var(--foreground)]">{value}</p>
    </div>
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

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">{text}</p>;
}

function TenantRentStatusBadge({ summary }: { summary: TenantRentStatusSummary }) {
  const classes = {
    none: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    paid: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
    paidAdvance: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
    partial: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
    dueSoon: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
    upcoming: "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
    late: "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  };

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[summary.status]}`}>{summary.label}</span>;
}

function RentPaymentBadge({ status }: { status: PaymentRecord["status"] }) {
  const classes = {
    payé: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
    partiel: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
    "en retard": "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
    "à venir": "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  };

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[status]}`}>{rentPaymentStatusLabel[status]}</span>;
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
  disabled = false,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function createEmptyTenantForm(store: LocalStore): NewTenantForm {
  const firstVacantUnit = store.units.find((unit) => isUnitAvailableForLease(store, unit.id));
  const firstProperty = firstVacantUnit
    ? store.properties.find((property) => property.id === firstVacantUnit.propertyId)
    : store.properties[0];

  return {
    fullName: "",
    email: "",
    phone: "",
    propertyId: firstProperty?.id ?? "",
    unitId: firstVacantUnit?.id ?? "",
    monthlyRent: firstVacantUnit?.monthlyRent ? firstVacantUnit.monthlyRent.toString() : "",
    leaseStartDate: "2026-07-01",
    leaseEndDate: "2027-06-30",
    paymentStatus: "dueSoon",
    initialAmountPaid: "",
    paymentReceivedDate: "",
    notes: "",
  };
}

function isNewTenantFormValid(form: NewTenantForm) {
  return Boolean(
    form.fullName.trim() &&
      form.propertyId &&
      form.unitId &&
      Number(form.monthlyRent) > 0 &&
      form.leaseStartDate &&
      form.leaseEndDate &&
      (form.paymentStatus !== "paid" && form.paymentStatus !== "partial" || isPaymentReceivedDateValid(form.paymentReceivedDate)) &&
      (form.paymentStatus !== "partial" || isPartialPaymentAmountValid(form.initialAmountPaid, form.monthlyRent)),
  );
}

function updateNewTenantPaymentStatus(form: NewTenantForm, paymentStatus: InitialPaymentStatus): NewTenantForm {
  return {
    ...form,
    paymentStatus,
    initialAmountPaid: paymentStatus === "partial" ? form.initialAmountPaid : "",
    paymentReceivedDate: paymentStatus === "paid" || paymentStatus === "partial" ? form.paymentReceivedDate || getTodayIsoDate() : "",
  };
}

function isPaymentReceivedDateValid(paymentReceivedDate: string) {
  return Boolean(paymentReceivedDate) && paymentReceivedDate <= getTodayIsoDate();
}

function isPartialPaymentAmountValid(initialAmountPaid: string, monthlyRent: string) {
  const amountPaid = Number(initialAmountPaid);
  const amountDue = Number(monthlyRent);

  return amountPaid > 0 && amountPaid < amountDue;
}

function getTenantDocuments(tenant: Tenant, unit: Unit | null, store: LocalStore) {
  const leaseIds = new Set(
    store.leases
      .filter((lease) => lease.tenantId === tenant.id || (unit ? lease.unitId === unit.id : false))
      .map((lease) => lease.id),
  );

  const documents = store.documents.filter((document) => {
    if (document.tenantId === tenant.id) {
      return true;
    }

    if (unit && document.unitId === unit.id) {
      return true;
    }

    if (document.leaseId && leaseIds.has(document.leaseId)) {
      return true;
    }

    if (document.relatedEntityId === tenant.id) {
      return true;
    }

    if (unit && document.relatedEntityId === unit.id) {
      return true;
    }

    return Boolean(document.relatedEntityId && leaseIds.has(document.relatedEntityId));
  });

  return Array.from(new Map(documents.map((document) => [document.id, document])).values());
}

function getTenantRentStatus(
  tenantId: string | null | undefined,
  store: LocalStore,
  ledgerRows: RentChargeRow[] = buildRentLedger(store).rows,
): TenantRentStatusSummary {
  if (!tenantId) {
    return {
      charge: null,
      label: "Aucun loyer actif",
      status: "none",
    };
  }

  const activeLeases = store.leases.filter((lease) => lease.tenantId === tenantId && lease.status === "active");

  if (activeLeases.length === 0) {
    return {
      charge: null,
      label: "Aucun loyer actif",
      status: "none",
    };
  }

  const activeLeaseIds = new Set(activeLeases.map((lease) => lease.id));
  const tenantCharges = ledgerRows.filter((charge) => activeLeaseIds.has(charge.leaseId) || charge.tenantId === tenantId);
  const today = getTodayIsoDate();
  const currentMonth = today.slice(0, 7);
  const overdueCharge = tenantCharges
    .filter((charge) => charge.balance > 0 && charge.dueDate < today)
    .sort(compareDueDateAscending)[0];

  if (overdueCharge) {
    return summarizeTenantCharge(overdueCharge, today);
  }

  const currentPartialCharge = tenantCharges
    .filter((charge) => charge.periodMonth === currentMonth && charge.balance > 0 && charge.amountAllocated > 0)
    .sort(compareDueDateAscending)[0];

  if (currentPartialCharge) {
    return summarizeTenantCharge(currentPartialCharge, today);
  }

  const currentCharge = tenantCharges
    .filter((charge) => charge.periodMonth === currentMonth)
    .sort(compareDueDateAscending)[0];

  if (currentCharge) {
    return summarizeTenantCharge(currentCharge, today);
  }

  const futureUnpaidCharge = tenantCharges
    .filter((charge) => charge.balance > 0 && charge.dueDate > today)
    .sort(compareDueDateAscending)[0];

  if (futureUnpaidCharge) {
    return summarizeTenantCharge(futureUnpaidCharge, today);
  }

  const futurePaidCharge = tenantCharges
    .filter((charge) => charge.balance <= 0 && charge.dueDate > today)
    .sort(compareDueDateAscending)[0];

  if (futurePaidCharge) {
    return summarizeTenantCharge(futurePaidCharge, today);
  }

  const latestPaidCharge = tenantCharges
    .filter((charge) => charge.balance <= 0)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];

  if (latestPaidCharge) {
    return summarizeTenantCharge(latestPaidCharge, today);
  }

  return {
    charge: null,
    label: "Aucun loyer actif",
    status: "none",
  };
}

function summarizeTenantCharge(charge: RentChargeRow, today: string): TenantRentStatusSummary {
  if (charge.balance <= 0) {
    const paidInAdvance = Boolean(charge.lastPaymentAt) && charge.lastPaymentAt < charge.dueDate;

    return {
      charge,
      label: paidInAdvance ? "Payé d'avance" : "Payé",
      status: paidInAdvance ? "paidAdvance" : "paid",
    };
  }

  if (charge.amountAllocated > 0) {
    return {
      charge,
      label: "Partiel",
      status: "partial",
    };
  }

  if (charge.dueDate < today) {
    return {
      charge,
      label: "En retard",
      status: "late",
    };
  }

  if (charge.dueDate > today && charge.dueDate <= addDaysIsoDate(today, 7)) {
    return {
      charge,
      label: "Dû bientôt",
      status: "dueSoon",
    };
  }

  return {
    charge,
    label: "À venir",
    status: "upcoming",
  };
}

function compareDueDateAscending(a: RentChargeRow, b: RentChargeRow) {
  return a.dueDate.localeCompare(b.dueDate);
}

function addDaysIsoDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day + days);

  return `${nextDate.getFullYear()}-${`${nextDate.getMonth() + 1}`.padStart(2, "0")}-${`${nextDate.getDate()}`.padStart(2, "0")}`;
}

function getTenantRows(store: LocalStore): TenantRow[] {
  const ledgerRows = buildRentLedger(store).rows;

  return store.tenants
    .filter((tenant) => !tenant.archivedAt)
    .map((tenant) => {
      const unit = getCurrentUnitForTenant(tenant.id, store);
      const occupancy = unit ? getUnitOccupancy(unit, store.leases, store.tenants) : null;

      return {
        tenant,
        unit,
        occupancy,
        propertyName: unit ? getPropertyName(unit.propertyId, store) : "Non assigné",
        rentStatus: getTenantRentStatus(tenant.id, store, ledgerRows),
        documentsCount: getTenantDocuments(tenant, unit, store).length,
      };
    })
    .sort((a, b) => `${a.tenant.lastName} ${a.tenant.firstName}`.localeCompare(`${b.tenant.lastName} ${b.tenant.firstName}`));
}

function getTenantSummary(store: LocalStore) {
  const occupancies = store.units.map((unit) => getUnitOccupancy(unit, store.leases, store.tenants));
  const activeTenantIds = new Set(occupancies.filter((occupancy) => occupancy.isOccupied && occupancy.tenantId).map((occupancy) => occupancy.tenantId as string));
  const ledgerRows = buildRentLedger(store).rows;
  const lateTenantIds = new Set(
    [...activeTenantIds].filter((tenantId) => getTenantRentStatus(tenantId, store, ledgerRows).status === "late"),
  );

  return {
    activeTenants: activeTenantIds.size,
    lateTenants: lateTenantIds.size,
    activeLeases: occupancies.filter((occupancy) => occupancy.source === "lease" && occupancy.leaseStatus === "active").length,
    vacantUnits: occupancies.filter((occupancy) => !occupancy.isOccupied).length,
  };
}

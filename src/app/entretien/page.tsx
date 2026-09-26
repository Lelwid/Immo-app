"use client";

import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { NotesPanel } from "@/components/NotesPanel";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import {
  createMaintenanceRequest,
  deleteMaintenanceRequest,
  getMaintenanceAttachments,
  getMaintenanceAttachmentUrl,
  updateMaintenanceRequest,
} from "@/lib/data/maintenanceService";
import {
  getPropertyName,
  getTenantName,
  getUnitLabel,
  ticketPriorityLabel,
  ticketStatusLabel,
} from "@/lib/mockData";
import type { LocalStore, MaintenanceAttachment, MaintenanceTicket, TicketPriority, TicketStatus, UnitActivity } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type TicketForm = Omit<MaintenanceTicket, "id">;
type TicketFilter = "all" | "open" | "inProgress" | "resolved" | "urgent";
type TicketModalMode = "create" | "edit";

const filters: { icon: IconName; label: string; value: TicketFilter }[] = [
  { icon: "list", label: "Toutes", value: "all" },
  { icon: "circle-dashed", label: "Ouvertes", value: "open" },
  { icon: "clock", label: "En cours", value: "inProgress" },
  { icon: "circle-check", label: "Fermées", value: "resolved" },
  { icon: "circle-alert", label: "Urgentes", value: "urgent" },
];

const priorityClasses: Record<TicketPriority, string> = {
  low: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  urgent: "border-red-500/35 bg-red-500/10 text-red-300",
};

const statusClasses: Record<TicketStatus, string> = {
  open: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  inProgress: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

export default function EntretienPage() {
  const { setStore } = useLocalStore();
  const { data, error: snapshotError, loading: snapshotLoading, refresh: refreshSnapshot } = usePortfolioSnapshot();
  const snapshotStore = data ?? emptyPortfolioStore;
  const firstPropertyId = snapshotStore.properties[0]?.id ?? "";
  const firstUnitId = snapshotStore.units.find((unit) => unit.propertyId === firstPropertyId)?.id ?? "";
  const [activeFilter, setActiveFilter] = useState<TicketFilter>("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketForm, setTicketForm] = useState<TicketForm>(() => createEmptyTicket(firstPropertyId, firstUnitId));
  const [modalMode, setModalMode] = useState<TicketModalMode | null>(null);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<MaintenanceTicket | null>(null);

  const filteredTickets = useMemo(() => {
    return snapshotStore.maintenanceTickets
      .filter((ticket) => {
        if (activeFilter === "all") return true;
        if (activeFilter === "urgent") return ticket.priority === "urgent" || ticket.priority === "high";
        return ticket.status === activeFilter;
      })
      .sort((a, b) => {
        const priorityDelta = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
        if (priorityDelta !== 0) return priorityDelta;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [activeFilter, snapshotStore.maintenanceTickets]);

  const selectedTicket =
    snapshotStore.maintenanceTickets.find((ticket) => ticket.id === selectedTicketId) ?? filteredTickets[0] ?? null;
  const selectedTenantName = selectedTicket ? getTenantName(getTenantIdForUnit(selectedTicket.unitId, snapshotStore), snapshotStore) : "Vacant";
  const availableUnits = snapshotStore.units.filter((unit) => unit.propertyId === ticketForm.propertyId);
  const relatedActivities = selectedTicket ? getRelatedActivities(selectedTicket, snapshotStore.activities) : [];

  async function refreshEntretienSnapshot() {
    try {
      await refreshSnapshot();
    } catch (error) {
      console.error("Impossible de rafraîchir les demandes d'entretien.", error);
    }
  }

  function openCreateModal() {
    const propertyId = snapshotStore.properties[0]?.id ?? "";
    const unitId = snapshotStore.units.find((unit) => unit.propertyId === propertyId)?.id ?? "";
    setTicketForm(createEmptyTicket(propertyId, unitId));
    setEditingTicketId(null);
    setModalMode("create");
  }

  function openEditModal(ticket: MaintenanceTicket) {
    setEditingTicketId(ticket.id);
    setTicketForm({
      propertyId: ticket.propertyId,
      unitId: ticket.unitId,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
    });
    setModalMode("edit");
  }

  function closeTicketModal() {
    setModalMode(null);
    setEditingTicketId(null);
    setTicketForm(createEmptyTicket(firstPropertyId, firstUnitId));
  }

  async function submitTicket() {
    if (!ticketForm.propertyId || !ticketForm.unitId || !ticketForm.title.trim()) {
      return;
    }

    if (modalMode === "edit" && editingTicketId) {
      const previousTicket = snapshotStore.maintenanceTickets.find((ticket) => ticket.id === editingTicketId);
      let savedTicket: MaintenanceTicket;

      try {
        savedTicket = await updateMaintenanceRequest(editingTicketId, {
          ...ticketForm,
          tenantId: getTenantIdForUnit(ticketForm.unitId, snapshotStore),
        });

        setStore((current) => ({
          ...current,
          maintenanceTickets: current.maintenanceTickets.map((ticket) =>
            ticket.id === editingTicketId ? savedTicket : ticket,
          ),
        }));
        await refreshEntretienSnapshot();
      } catch (error) {
        console.error("Impossible de modifier la demande d'entretien.", error);
        return;
      }

      try {
        const activity = await createActivityRecord({
          propertyId: savedTicket.propertyId,
          unitId: savedTicket.unitId,
          tenantId: getTenantIdForUnit(savedTicket.unitId, snapshotStore),
          type: "entretien",
          title: savedTicket.status === "resolved" && previousTicket?.status !== "resolved" ? "Demande fermée" : "Demande mise à jour",
          description:
            savedTicket.status === "resolved" && previousTicket?.status !== "resolved"
              ? `Demande fermée: ${savedTicket.title}.`
              : `Demande mise à jour: ${savedTicket.title}.`,
        });

        setStore((current) => addActivityToStore(current, activity));
        await refreshEntretienSnapshot();
      } catch (error) {
        console.error("Impossible de créer l'activité d'entretien.", error);
      }
      setSelectedTicketId(editingTicketId);
    } else {
      let savedTicket: MaintenanceTicket;

      try {
        savedTicket = await createMaintenanceRequest({
          ...ticketForm,
          tenantId: getTenantIdForUnit(ticketForm.unitId, snapshotStore),
        });

        setStore((current) => ({
          ...current,
          maintenanceTickets: upsertMaintenanceTicket(current.maintenanceTickets, savedTicket),
        }));
        await refreshEntretienSnapshot();
      } catch (error) {
        console.error("Impossible de créer la demande d'entretien.", error);
        return;
      }

      try {
        const activity = await createActivityRecord({
          propertyId: savedTicket.propertyId,
          unitId: savedTicket.unitId,
          tenantId: getTenantIdForUnit(savedTicket.unitId, snapshotStore),
          date: savedTicket.createdAt,
          type: "entretien",
          title: "Demande d'entretien",
          description: `Demande ouverte: ${savedTicket.title}.`,
        });

        setStore((current) => addActivityToStore(current, activity));
        await refreshEntretienSnapshot();
      } catch (error) {
        console.error("Impossible de créer l'activité d'entretien.", error);
      }
      setSelectedTicketId(savedTicket.id);
    }

    closeTicketModal();
  }

  async function updateTicketStatus(ticket: MaintenanceTicket, status: TicketStatus) {
    if (ticket.status === status) {
      return;
    }

    let savedTicket: MaintenanceTicket;

    try {
      savedTicket = await updateMaintenanceRequest(ticket.id, { status });
      setStore((current) => ({
        ...current,
        maintenanceTickets: current.maintenanceTickets.map((candidate) =>
          candidate.id === ticket.id ? savedTicket : candidate,
        ),
      }));
      await refreshEntretienSnapshot();
    } catch (error) {
      console.error("Impossible de modifier la demande d'entretien.", error);
      return;
    }

    try {
      const activity = await createActivityRecord({
        propertyId: savedTicket.propertyId,
        unitId: savedTicket.unitId,
        tenantId: getTenantIdForUnit(savedTicket.unitId, snapshotStore),
        type: "entretien",
        title: status === "resolved" ? "Demande fermée" : "Demande marquée en cours",
        description:
          status === "resolved"
            ? `Demande fermée: ${savedTicket.title}.`
            : `Demande marquée en cours: ${savedTicket.title}.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      await refreshEntretienSnapshot();
    } catch (error) {
      console.error("Impossible de créer l'activité d'entretien.", error);
    }
  }

  async function deleteTicket(ticketId: string) {
    const ticket = snapshotStore.maintenanceTickets.find((candidate) => candidate.id === ticketId);

    try {
      await deleteMaintenanceRequest(ticketId);

      setStore((current) => ({
        ...current,
        maintenanceTickets: current.maintenanceTickets.filter((candidate) => candidate.id !== ticketId),
      }));
      await refreshEntretienSnapshot();
    } catch (error) {
      console.error("Impossible de supprimer la demande d'entretien.", error);
      return;
    }

    if (ticket) {
      try {
        const activity = await createActivityRecord({
          propertyId: ticket.propertyId,
          unitId: ticket.unitId,
          tenantId: getTenantIdForUnit(ticket.unitId, snapshotStore),
          type: "entretien",
          title: "Demande supprimée",
          description: `Demande supprimée: ${ticket.title}.`,
        });

        setStore((current) => addActivityToStore(current, activity));
        await refreshEntretienSnapshot();
      } catch (error) {
        console.error("Impossible de créer l'activité d'entretien.", error);
      }
    }

    setTicketToDelete(null);
    if (selectedTicketId === ticketId) {
      setSelectedTicketId(null);
    }
  }

  function updateProperty(propertyId: string) {
    const unitId = snapshotStore.units.find((unit) => unit.propertyId === propertyId)?.id ?? "";
    setTicketForm({ ...ticketForm, propertyId, unitId });
  }

  return (
    <RouteShell
      title="Demandes d'entretien"
      description="Suivez les problèmes, réparations et inspections liés aux logements et immeubles."
    >
      <section className="grid gap-5">
        {!data ? (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-sm font-semibold text-[var(--muted)]">
              {snapshotLoading ? "Chargement des demandes d'entretien..." : "Impossible de charger les données du portefeuille."}
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeFilter === filter.value
                    ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[color:var(--accent)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                <AppIcon name={filter.icon} size={16} />
                <span>{filter.label}</span>
              </button>
            ))}
          </div>
          <button className="btn-primary self-start lg:self-auto" onClick={openCreateModal} type="button">
            + Nouvelle demande
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">Liste des demandes</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{filteredTickets.length} demande{filteredTickets.length > 1 ? "s" : ""}</p>
                {snapshotLoading ? <p className="mt-1 text-xs font-semibold uppercase text-[var(--muted)]">Synchronisation des demandes...</p> : null}
                {snapshotError ? <p className="mt-1 text-sm font-semibold text-[color:var(--yellow)]">{snapshotError}</p> : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {filteredTickets.map((ticket) => {
                const selected = selectedTicket?.id === ticket.id;

                return (
                  <button
                    key={ticket.id}
                    aria-pressed={selected}
                    className={`w-full rounded-lg border p-4 text-left transition ${
                      selected
                        ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10"
                        : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[color:var(--accent)] hover:bg-[var(--surface-3)]"
                    }`}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    type="button"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-semibold text-[var(--foreground)]">{ticket.title}</h3>
                        <p className="mt-1 line-clamp-1 text-xs font-semibold uppercase text-[var(--muted)]">
                          {getPropertyName(ticket.propertyId, snapshotStore)} · {getUnitLabel(ticket.unitId, snapshotStore)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-[color:var(--accent)]">→</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
                      <span className="truncate">Locataire: {getTenantName(getTenantIdForUnit(ticket.unitId, snapshotStore), snapshotStore)}</span>
                      <span className="truncate sm:text-right">{formatDate(ticket.createdAt)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge label={ticketPriorityLabel[ticket.priority]} tone={priorityClasses[ticket.priority]} />
                      <Badge label={ticketStatusLabel[ticket.status]} tone={statusClasses[ticket.status]} />
                    </div>
                  </button>
                );
              })}
              {filteredTickets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-6 text-sm text-[var(--muted)]">
                  Aucune demande ne correspond à ce filtre.
                </div>
              ) : null}
            </div>
          </div>

          <aside className="hidden xl:block">
            <TicketDetailPanel
              activities={relatedActivities}
              onDelete={setTicketToDelete}
              onEdit={openEditModal}
              onStatusChange={updateTicketStatus}
              selectedTenantName={selectedTenantName}
              store={snapshotStore}
              onNotesChange={refreshEntretienSnapshot}
              ticket={selectedTicket}
            />
          </aside>
        </div>

        {selectedTicket ? (
          <div className="xl:hidden">
            <MobileTicketDrawer
              activities={relatedActivities}
              onClose={() => setSelectedTicketId(null)}
              onDelete={setTicketToDelete}
              onEdit={openEditModal}
              onStatusChange={updateTicketStatus}
              selectedTenantName={selectedTenantName}
              store={snapshotStore}
              onNotesChange={refreshEntretienSnapshot}
              ticket={selectedTicket}
            />
          </div>
        ) : null}

        {modalMode ? (
          <TicketFormModal
            availableUnits={availableUnits}
            mode={modalMode}
            onCancel={closeTicketModal}
            onChange={setTicketForm}
            onPropertyChange={updateProperty}
            onSubmit={submitTicket}
            properties={snapshotStore.properties.map((property) => [property.id, property.name])}
            ticketForm={ticketForm}
          />
        ) : null}

        {ticketToDelete ? (
          <ConfirmModal
            title="Supprimer la demande ?"
            message="Voulez-vous vraiment supprimer cette demande d'entretien ?"
            cancelLabel="Non"
            confirmLabel="Oui, supprimer"
            onCancel={() => setTicketToDelete(null)}
            onConfirm={() => deleteTicket(ticketToDelete.id)}
          />
        ) : null}
        </>
        ) : null}
      </section>
    </RouteShell>
  );
}

function TicketDetailPanel({
  activities,
  onNotesChange,
  onDelete,
  onEdit,
  onStatusChange,
  selectedTenantName,
  store,
  ticket,
}: {
  activities: UnitActivity[];
  onNotesChange: () => void;
  onDelete: (ticket: MaintenanceTicket) => void;
  onEdit: (ticket: MaintenanceTicket) => void;
  onStatusChange: (ticket: MaintenanceTicket, status: TicketStatus) => void;
  selectedTenantName: string;
  store: LocalStore;
  ticket: MaintenanceTicket | null;
}) {
  if (!ticket) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
        Sélectionnez une demande pour consulter ses détails.
      </div>
    );
  }

  return (
    <div className="sticky top-5 grid max-h-[calc(100vh-2.5rem)] gap-4 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 custom-scrollbar">
      <div className="flex flex-col gap-4 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
            {getPropertyName(ticket.propertyId, store)} · {getUnitLabel(ticket.unitId, store)}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{ticket.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{ticket.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Badge label={ticketPriorityLabel[ticket.priority]} tone={priorityClasses[ticket.priority]} />
          <Badge label={ticketStatusLabel[ticket.status]} tone={statusClasses[ticket.status]} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InfoCard label="Immeuble" value={getPropertyName(ticket.propertyId, store)} />
        <InfoCard label="Logement" value={getUnitLabel(ticket.unitId, store)} />
        <InfoCard label="Locataire" value={selectedTenantName} />
        <InfoCard label="Date de création" value={formatDate(ticket.createdAt)} />
        <InfoCard label="Priorité" value={ticketPriorityLabel[ticket.priority]} />
        <InfoCard label="Statut" value={ticketStatusLabel[ticket.status]} />
      </div>

      <MaintenanceAttachments ticketId={ticket.id} />

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="font-semibold text-[var(--foreground)]">Actions</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button className="btn-secondary" onClick={() => onEdit(ticket)} type="button">
            Modifier
          </button>
          <button className="btn-danger" onClick={() => onDelete(ticket)} type="button">
            Supprimer
          </button>
          <button className="btn-secondary" onClick={() => onStatusChange(ticket, "inProgress")} type="button">
            Marquer en cours
          </button>
          <button className="btn-primary" onClick={() => onStatusChange(ticket, "resolved")} type="button">
            Marquer fermée
          </button>
        </div>
      </div>

      <NotesPanel
        collapsedComposer
        compact
        propertyId={ticket.propertyId}
        targetId={ticket.id}
        targetType="entretien"
        tenantId={getTenantIdForUnit(ticket.unitId, store)}
        title="Notes de la demande"
        unitId={ticket.unitId}
        onChanged={onNotesChange}
        notesSource={store.notes}
      />

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="font-semibold text-[var(--foreground)]">Historique lié</h3>
        <div className="mt-3 grid gap-3">
          {activities.map((activity) => (
            <article key={activity.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">{formatDate(activity.date)}</p>
              <p className="mt-1 font-semibold text-[var(--foreground)]">{activity.title}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{activity.description}</p>
            </article>
          ))}
          {activities.length === 0 ? (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
              Aucun historique lié pour cette demande.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MaintenanceAttachments({ ticketId }: { ticketId: string }) {
  const [attachments, setAttachments] = useState<MaintenanceAttachment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getMaintenanceAttachments(ticketId)
      .then((items) => {
        if (!cancelled) {
          setAttachments(items);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAttachments([]);
          setError("Impossible de charger les photos de la demande.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  async function openAttachment(attachment: MaintenanceAttachment) {
    setOpeningId(attachment.id);
    setError("");

    try {
      const url = await getMaintenanceAttachmentUrl(attachment);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Impossible d’ouvrir la photo.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <h3 className="font-semibold text-[var(--foreground)]">Photos jointes</h3>
      {loading ? <p className="mt-3 text-sm text-[var(--muted)]">Chargement des photos...</p> : null}
      {!loading && attachments.length === 0 && !error ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Aucune photo jointe.</p>
      ) : null}
      {attachments.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {attachments.map((attachment) => (
            <button
              className="btn-secondary flex items-center justify-between gap-3 text-left"
              disabled={openingId === attachment.id}
              key={attachment.id}
              onClick={() => void openAttachment(attachment)}
              type="button"
            >
              <span className="min-w-0 truncate">{attachment.fileName}</span>
              <span className="shrink-0">{openingId === attachment.id ? "Ouverture..." : "Ouvrir"}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm font-semibold text-[color:var(--red)]">{error}</p> : null}
    </section>
  );
}

function MobileTicketDrawer(props: {
  activities: UnitActivity[];
  onNotesChange: () => void;
  onClose: () => void;
  onDelete: (ticket: MaintenanceTicket) => void;
  onEdit: (ticket: MaintenanceTicket) => void;
  onStatusChange: (ticket: MaintenanceTicket, status: TicketStatus) => void;
  selectedTenantName: string;
  store: LocalStore;
  ticket: MaintenanceTicket;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 xl:hidden">
      <div className="ml-auto flex h-full w-full flex-col bg-[var(--background)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--muted)]">Détail de la demande</p>
          <button className="btn-secondary" onClick={props.onClose} type="button">
            Fermer
          </button>
        </div>
        <TicketDetailPanel {...props} />
      </div>
    </div>
  );
}

function TicketFormModal({
  availableUnits,
  mode,
  onCancel,
  onChange,
  onPropertyChange,
  onSubmit,
  properties,
  ticketForm,
}: {
  availableUnits: { id: string; label: string }[];
  mode: TicketModalMode;
  onCancel: () => void;
  onChange: (form: TicketForm) => void;
  onPropertyChange: (propertyId: string) => void;
  onSubmit: () => void;
  properties: string[][];
  ticketForm: TicketForm;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 sm:items-center sm:px-4 sm:py-6">
      <div className="custom-scrollbar max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {mode === "edit" ? "Modifier la demande d'entretien" : "Nouvelle demande d'entretien"}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Le formulaire reste isolé pour garder la page principale compacte.
            </p>
          </div>
          <button className="btn-secondary" onClick={onCancel} type="button">
            X
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SelectInput label="Immeuble" value={ticketForm.propertyId} onChange={onPropertyChange} options={properties} />
          <SelectInput
            label="Logement"
            value={ticketForm.unitId}
            onChange={(unitId) => onChange({ ...ticketForm, unitId })}
            options={availableUnits.map((unit) => [unit.id, unit.label])}
          />
          <div className="sm:col-span-2">
            <TextInput label="Titre" value={ticketForm.title} onChange={(title) => onChange({ ...ticketForm, title })} />
          </div>
          <div className="sm:col-span-2">
            <TextAreaInput
              label="Description"
              value={ticketForm.description}
              onChange={(description) => onChange({ ...ticketForm, description })}
            />
          </div>
          <SelectInput
            label="Priorité"
            value={ticketForm.priority}
            onChange={(priority) => onChange({ ...ticketForm, priority: priority as TicketPriority })}
            options={[
              ["low", "Faible"],
              ["medium", "Moyenne"],
              ["high", "Élevée"],
              ["urgent", "Urgente"],
            ]}
          />
          <SelectInput
            label="Statut"
            value={ticketForm.status}
            onChange={(status) => onChange({ ...ticketForm, status: status as TicketStatus })}
            options={[
              ["open", "Ouverte"],
              ["inProgress", "En cours"],
              ["resolved", "Résolue"],
            ]}
          />
          <TextInput
            label="Date de création"
            type="date"
            value={ticketForm.createdAt}
            onChange={(createdAt) => onChange({ ...ticketForm, createdAt })}
          />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-primary" onClick={onSubmit} type="button">
            {mode === "edit" ? "Enregistrer" : "Créer la demande"}
          </button>
        </div>
      </div>
    </div>
  );
}

function createEmptyTicket(propertyId: string, unitId: string): TicketForm {
  return {
    propertyId,
    unitId,
    title: "",
    description: "",
    status: "open",
    priority: "medium",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function upsertMaintenanceTicket(tickets: MaintenanceTicket[], ticket: MaintenanceTicket) {
  return tickets.some((candidate) => candidate.id === ticket.id)
    ? tickets.map((candidate) => (candidate.id === ticket.id ? ticket : candidate))
    : [...tickets, ticket];
}

function getPriorityWeight(priority: TicketPriority) {
  const weights: Record<TicketPriority, number> = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };

  return weights[priority];
}

function getRelatedActivities(ticket: MaintenanceTicket, activities: UnitActivity[]) {
  const normalizedTitle = normalize(ticket.title);

  return activities
    .filter((activity) => {
      if (activity.propertyId !== ticket.propertyId || activity.unitId !== ticket.unitId) {
        return false;
      }

      const searchable = normalize(`${activity.title} ${activity.description}`);
      return activity.type === "entretien" && (!normalizedTitle || searchable.includes(normalizedTitle));
    })
    .sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date));
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("fr-CA");
}

function Badge({ label, tone }: { label: string; tone?: string }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone ?? "border-[var(--border)] bg-[var(--surface-3)] text-[var(--muted)]"}`}>
      {label}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--foreground)]">{value}</p>
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-2 sm:items-center sm:px-4 sm:py-6">
      <div className="custom-scrollbar max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--foreground)] sm:p-6">
        <h2 className="text-2xl font-semibold">{title}</h2>
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

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
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

function TextAreaInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <textarea
        className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getTenantIdForUnit(unitId: string, store: LocalStore) {
  const unit = store.units.find((candidate) => candidate.id === unitId);

  if (!unit) {
    return null;
  }

  return getUnitOccupancy(unit, store.leases, store.tenants).tenantId;
}

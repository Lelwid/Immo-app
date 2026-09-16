"use client";

import Link from "next/link";
import type { KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { getNotificationItems, getPropertyName, getTenantName, getUnitLabel } from "@/lib/mockData";
import type { ActivityType, LocalStore, UnitActivity } from "@/lib/types";

type ActivityFilter = "tous" | ActivityType;
type TimelineType = ActivityType | "notification" | "calendrier";

type TimelineActivity = {
  id: string;
  propertyId?: string;
  unitId?: string;
  tenantId?: string | null;
  propertyLabel?: string;
  unitLabel?: string;
  tenantLabel?: string | null;
  type: TimelineType;
  title: string;
  description: string;
  date: string;
  createdAt?: string;
  href: string;
};

const filters: { icon: IconName; label: string; value: ActivityFilter }[] = [
  { icon: "list", label: "Tous", value: "tous" },
  { icon: "credit-card", label: "Paiements", value: "paiement" },
  { icon: "file-text", label: "Baux", value: "bail" },
  { icon: "wrench", label: "Demandes d'entretien", value: "entretien" },
  { icon: "folder-open", label: "Documents", value: "document" },
  { icon: "building-2", label: "Immeubles", value: "immeuble" },
];

const activityTypeLabel: Record<TimelineType, string> = {
  paiement: "Paiement",
  bail: "Bail",
  entretien: "Demande d'entretien",
  document: "Document",
  locataire: "Locataire",
  immeuble: "Immeuble",
  note: "Note",
  tache: "Tâche personnelle",
  notification: "Notification",
  calendrier: "Calendrier",
};

const activityTypeClass: Record<TimelineType, string> = {
  paiement: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  bail: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  entretien: "border-[color:var(--red)]/30 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  document: "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  locataire: "border-[var(--border)] bg-[var(--surface-3)] text-[var(--foreground)]",
  immeuble: "border-[var(--border)] bg-[var(--surface-3)] text-[var(--foreground)]",
  note: "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
  tache: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  notification: "border-[color:var(--red)]/30 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  calendrier: "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
};

export default function ActivitesPage() {
  const { data, error: snapshotError, loading: snapshotLoading, refresh: refreshSnapshot } = usePortfolioSnapshot();
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>("tous");
  const [searchQuery, setSearchQuery] = useState("");
  const snapshotStore = data;
  const activities = useMemo(
    () => (snapshotStore ? getActivities(snapshotStore, activeFilter, searchQuery) : []),
    [activeFilter, searchQuery, snapshotStore],
  );

  if (!snapshotStore) {
    return (
      <RouteShell title="Journal d’activité" description="Historique complet du portefeuille">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-semibold text-[var(--muted)]">
            {snapshotLoading ? "Chargement du journal d’activité..." : "Impossible de charger les données du portefeuille."}
          </p>
          {snapshotError ? <p className="mt-2 text-sm text-[color:var(--yellow)]">{snapshotError}</p> : null}
          {snapshotError ? (
            <button className="btn-secondary mt-4" onClick={() => void refreshSnapshot()} type="button">
              Réessayer
            </button>
          ) : null}
        </section>
      </RouteShell>
    );
  }

  return (
    <RouteShell title="Journal d’activité" description="Historique complet du portefeuille">
      <section className="grid gap-5">
        <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  activeFilter === filter.value
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                <AppIcon name={filter.icon} size={16} />
                <span>{filter.label}</span>
              </button>
            ))}
          </div>
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[color:var(--accent)]"
            placeholder="Rechercher dans l’activité..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-5 flex flex-col gap-2 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">Timeline</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{activities.length} événements affichés</p>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              Plus récent en premier
            </span>
          </div>

          <div className="grid gap-3">
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} store={snapshotStore} />
            ))}
            {activities.length === 0 ? (
              <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                Aucun événement ne correspond à ces critères.
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </RouteShell>
  );
}

function ActivityItem({ activity, store }: { activity: TimelineActivity; store: LocalStore }) {
  const property = activity.propertyLabel ?? (activity.propertyId ? getPropertyName(activity.propertyId, store) : "Portefeuille");
  const unit = activity.unitLabel ?? (activity.unitId ? getUnitLabel(activity.unitId, store) : "Aucun logement");
  const tenant = activity.tenantLabel ?? (activity.tenantId ? getTenantName(activity.tenantId, store) : null);

  function handleCardKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  return (
    <Link
      aria-label={`Ouvrir l'activité: ${activity.title}`}
      className="group block cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
      href={activity.href}
      onKeyDown={handleCardKeyDown}
      role="button"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${activityTypeClass[activity.type]}`}>
              {activityTypeLabel[activity.type]}
            </span>
            <span className="text-xs font-semibold text-[var(--muted)]">{formatDate(activity.date)}</span>
          </div>
          <h3 className="mt-3 font-semibold text-[var(--foreground)] transition group-hover:text-[color:var(--accent)]">{activity.title}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{activity.description}</p>
          <p className="mt-3 text-sm text-[var(--foreground)]">
            {property} · {unit}
            {tenant ? ` · ${tenant}` : ""}
          </p>
        </div>
        <span className="hidden shrink-0 text-xl text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[color:var(--accent)] lg:block" aria-hidden="true">
          →
        </span>
      </div>
    </Link>
  );
}

function getActivities(store: LocalStore, activeFilter: ActivityFilter, searchQuery: string) {
  const normalizedQuery = normalizeSearch(searchQuery);
  const activities = [...getStoredActivities(store), ...getNotificationActivities(store), ...getCalendarActivities(store)];

  return activities
    .filter((activity) => activeFilter === "tous" || activity.type === activeFilter)
    .filter((activity) => {
      if (!normalizedQuery) {
        return true;
      }

      const property = activity.propertyLabel ?? (activity.propertyId ? getPropertyName(activity.propertyId, store) : "");
      const unit = activity.unitLabel ?? (activity.unitId ? getUnitLabel(activity.unitId, store) : "");
      const tenant = activity.tenantLabel ?? (activity.tenantId ? getTenantName(activity.tenantId, store) : "");
      return normalizeSearch(`${activity.title} ${activity.description} ${activity.type} ${property} ${unit} ${tenant}`).includes(normalizedQuery);
    })
    .sort((a, b) => (b.createdAt ?? `${b.date}T12:00:00`).localeCompare(a.createdAt ?? `${a.date}T12:00:00`));
}

function getStoredActivities(store: LocalStore): TimelineActivity[] {
  return store.activities.map((activity) => ({
    ...activity,
    href: getActivityHref(activity),
  }));
}

function getNotificationActivities(store: LocalStore): TimelineActivity[] {
  return getNotificationItems(store).map((notification) => ({
    id: `notification-${notification.id}`,
    type: "notification",
    title: notification.title,
    description: `${notification.recommendedAction} ${notification.urgencyReason}`,
    date: (notification.relatedDeadline ?? notification.sortDate).slice(0, 10),
    createdAt: notification.sortDate,
    propertyLabel: notification.property,
    unitLabel: notification.unit,
    tenantLabel: notification.tenant,
    href: notification.href,
  }));
}

function getCalendarActivities(store: LocalStore): TimelineActivity[] {
  const events: TimelineActivity[] = [];

  for (const payment of store.payments) {
    events.push({
      id: `calendrier-paiement-${payment.id}`,
      type: "calendrier",
      title: payment.status === "payé" ? "Paiement reçu au calendrier" : "Échéance de loyer",
      description:
        payment.status === "en retard"
          ? "Suivi requis pour un paiement en retard."
          : "Événement de paiement prévu au calendrier opérationnel.",
      date: payment.paidAt || payment.dueDate,
      propertyId: payment.propertyId,
      unitId: payment.unitId,
      tenantId: payment.tenantId,
      href: `/dashboard?property=${payment.propertyId}&unit=${payment.unitId}&tab=paiements`,
    });
  }

  for (const lease of store.leases.filter((candidate) => candidate.status === "active")) {
    const unit = store.units.find((candidate) => candidate.id === lease.unitId);

    if (!unit) {
      continue;
    }

    events.push({
      id: `calendrier-bail-${lease.id}`,
      type: "calendrier",
      title: "Fin de bail au calendrier",
      description: "Date importante à surveiller pour le renouvellement du bail.",
      date: lease.endDate,
      propertyId: lease.propertyId,
      unitId: lease.unitId,
      tenantId: lease.tenantId,
      href: `/dashboard?property=${lease.propertyId}&unit=${lease.unitId}&tab=bail`,
    });
  }

  for (const ticket of store.maintenanceTickets) {
    events.push({
      id: `calendrier-entretien-${ticket.id}`,
      type: "calendrier",
      title: ticket.priority === "urgent" || ticket.priority === "high" ? "Demande d'entretien prioritaire au calendrier" : "Suivi de demande d'entretien au calendrier",
      description: ticket.description,
      date: ticket.createdAt,
      propertyId: ticket.propertyId,
      unitId: ticket.unitId,
      tenantId: getTenantIdForUnit(ticket.unitId, store),
      href: "/entretien",
    });
  }

  for (const document of store.documents) {
    if (document.type !== "assurance" && document.type !== "inspection") {
      continue;
    }

    events.push({
      id: `calendrier-document-${document.id}`,
      type: "calendrier",
      title: document.type === "assurance" ? "Renouvellement d’assurance au calendrier" : "Inspection au calendrier",
      description: `Document lié: ${document.name}`,
      date: document.type === "assurance" ? addDays(document.uploadDate, 365) : document.uploadDate,
      propertyId: document.propertyId,
      unitId: document.unitId,
      tenantId: getTenantIdForUnit(document.unitId, store),
      href: `/documents?document=${document.id}`,
    });
  }

  return events;
}

function getActivityHref(activity: UnitActivity) {
  if (activity.type === "paiement" && activity.propertyId && activity.unitId) {
    return `/dashboard?property=${activity.propertyId}&unit=${activity.unitId}&tab=paiements`;
  }

  if (activity.type === "bail" && activity.propertyId && activity.unitId) {
    return `/dashboard?property=${activity.propertyId}&unit=${activity.unitId}&tab=bail`;
  }

  if (activity.type === "document") {
    return "/documents";
  }

  if (activity.type === "entretien") {
    return "/entretien";
  }

  if (activity.type === "immeuble" && activity.propertyId) {
    return `/immeubles/${activity.propertyId}`;
  }

  if (activity.type === "note" && activity.unitId && activity.propertyId) {
    return `/dashboard?property=${activity.propertyId}&unit=${activity.unitId}&tab=notes`;
  }

  if (activity.type === "tache") {
    return "/taches";
  }

  if (activity.unitId && activity.propertyId) {
    return `/dashboard?property=${activity.propertyId}&unit=${activity.unitId}&tab=historique`;
  }

  return "/dashboard";
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function addDays(date: string, days: number) {
  const nextDate = new Date(`${date}T12:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function getTenantIdForUnit(unitId: string, store: LocalStore) {
  const unit = store.units.find((candidate) => candidate.id === unitId);

  if (!unit) {
    return null;
  }

  return getUnitOccupancy(unit, store.leases, store.tenants).tenantId;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

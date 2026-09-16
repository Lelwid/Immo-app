"use client";

import { useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { NotificationList, notificationPriorityCopy } from "@/components/NotificationList";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { getNotificationItems } from "@/lib/mockData";
import type { NotificationPriority } from "@/lib/types";

type NotificationFilter = "toutes" | NotificationPriority;

const filters: { icon: IconName; label: string; value: NotificationFilter }[] = [
  { icon: "list", label: "Toutes", value: "toutes" },
  { icon: "circle-alert", label: "Urgentes", value: "urgent" },
  { icon: "clock", label: "À surveiller", value: "attention" },
  { icon: "circle-dashed", label: "Information", value: "info" },
];

export default function NotificationsPage() {
  const { data, error: snapshotError, loading: snapshotLoading, refresh: refreshSnapshot } = usePortfolioSnapshot();
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("toutes");
  const snapshotStore = data;
  const notifications = useMemo(() => (snapshotStore ? getNotificationItems(snapshotStore) : []), [snapshotStore]);

  const filteredNotifications = useMemo(
    () =>
      activeFilter === "toutes"
        ? notifications
        : notifications.filter((notification) => notification.priority === activeFilter),
    [activeFilter, notifications],
  );

  return (
    <RouteShell
      title="Notifications"
      description="Alertes légères générées à partir des paiements, baux, demandes d’entretien et documents du portefeuille."
    >
      <section className="grid gap-5">
        {!snapshotStore ? (
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-sm font-semibold text-[var(--muted)]">
              {snapshotLoading ? "Chargement des notifications..." : "Impossible de charger les données du portefeuille."}
            </p>
            {snapshotError ? <p className="mt-2 text-sm text-[color:var(--yellow)]">{snapshotError}</p> : null}
            {snapshotError ? (
              <button className="btn-secondary mt-4" onClick={() => void refreshSnapshot()} type="button">
                Réessayer
              </button>
            ) : null}
          </section>
        ) : null}

        {snapshotStore ? <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {filters.map((filter) => {
            const active = activeFilter === filter.value;
            const priority = filter.value === "toutes" ? null : notificationPriorityCopy[filter.value];

            return (
              <button
                key={filter.value}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <AppIcon name={filter.icon} size={16} />
                  {priority ? <span className={`h-2 w-2 rounded-full ${priority.dot}`} /> : null}
                  {filter.label}
                </span>
              </button>
            );
          })}
        </div> : null}

        {snapshotStore ? <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-5 flex flex-col gap-2 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">Liste des notifications</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{filteredNotifications.length} notifications affichées</p>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              Données locales
            </span>
          </div>
          <NotificationList notifications={filteredNotifications} />
        </div> : null}
      </section>
    </RouteShell>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { NotificationList, notificationPriorityCopy } from "@/components/NotificationList";
import { loadPortfolioSnapshot, type PortfolioSnapshot } from "@/lib/data/portfolioSnapshotService";
import { getNotificationItems } from "@/lib/mockData";
import type { NotificationPriority } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type NotificationFilter = "toutes" | NotificationPriority;

const filters: { label: string; value: NotificationFilter }[] = [
  { label: "Toutes", value: "toutes" },
  { label: "Urgentes", value: "urgent" },
  { label: "À surveiller", value: "attention" },
  { label: "Information", value: "info" },
];

export default function NotificationsPage() {
  const { store } = useLocalStore();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("toutes");
  const snapshotStore = snapshot ?? store;
  const notifications = useMemo(() => getNotificationItems(snapshotStore), [snapshotStore]);

  useEffect(() => {
    let active = true;

    loadPortfolioSnapshot()
      .then((nextSnapshot) => {
        if (active) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((error) => {
        console.error("Impossible de charger les notifications depuis le snapshot.", error);
      });

    return () => {
      active = false;
    };
  }, []);

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
        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {filters.map((filter) => {
            const active = activeFilter === filter.value;
            const priority = filter.value === "toutes" ? null : notificationPriorityCopy[filter.value];

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
                <span className="inline-flex items-center gap-2">
                  {priority ? <span className={`h-2 w-2 rounded-full ${priority.dot}`} /> : null}
                  {filter.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
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
        </div>
      </section>
    </RouteShell>
  );
}

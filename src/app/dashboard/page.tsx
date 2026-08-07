"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BuildingVisual } from "@/components/buildings/BuildingVisuals";
import { DocumentFileActions } from "@/components/DocumentFileActions";
import { NotesPanel } from "@/components/NotesPanel";
import { NotificationList } from "@/components/NotificationList";
import { TaskComposer } from "@/components/TaskComposer";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { createDocumentWithFile, deleteDocument as deleteDocumentRecord } from "@/lib/data/documentsService";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { buildRentLedger } from "@/lib/data/rentLedgerService";
import { createTask as createTaskRecord } from "@/lib/data/tasksService";
import { exportPortfolioReport } from "@/lib/reportExports";
import {
  currency,
  documentTypeLabel,
  getNotificationItems,
  getPortfolioSummary,
  getPropertyDashboards,
  getRecentActivities,
  rentPaymentStatusLabel,
} from "@/lib/mockData";
import type { AppNote, AppTask, Health, LocalStore, NotificationItem, PropertyDashboard, PropertyDocument, TaskPriority, UnitActivity, UnitDashboard } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

const healthCopy: Record<Health, { label: string; classes: string; dot: string; glow: string }> = {
  ok: {
    label: "OK",
    classes: "border-[color:var(--green)]/30 bg-[color:var(--green)]/10 text-[color:var(--green)]",
    dot: "bg-[color:var(--green)]",
    glow: "shadow-[color:var(--green)]/10",
  },
  attention: {
    label: "Attention",
    classes: "border-[color:var(--yellow)]/30 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
    dot: "bg-[color:var(--yellow)]",
    glow: "shadow-[color:var(--yellow)]/10",
  },
  issue: {
    label: "Problème",
    classes: "border-[color:var(--red)]/30 bg-[color:var(--red)]/10 text-[color:var(--red)]",
    dot: "bg-[color:var(--red)]",
    glow: "shadow-[color:var(--red)]/10",
  },
};

const paymentStatusLabel: Record<UnitDashboard["paymentStatus"], string> = {
  paid: "Payé",
  dueSoon: "Dû bientôt",
  late: "En retard",
};

function getTenantName(unit: UnitDashboard) {
  if (unit.tenant) {
    return unit.tenant.fullName?.trim() || `${unit.tenant.firstName} ${unit.tenant.lastName}`.trim();
  }

  return unit.tenantId ? "Locataire introuvable" : "Vacant";
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function getInitialDashboardRoute() {
  if (typeof window === "undefined") {
    return { propertyId: null, unitId: null, tab: null };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    propertyId: params.get("property"),
    unitId: params.get("unit"),
    tab: params.get("tab"),
  };
}

function getCopilotSummary(store: LocalStore): CopilotSummary {
  const ledgerRows = buildRentLedger(store).rows;
  const latePayments = ledgerRows.filter((payment) => payment.balance > 0 && payment.dueDate < getTodayIsoDate());
  const expiringLeases = store.leases.filter((lease) => lease.status === "active" && isLeaseExpiringSoon(lease.endDate));
  const urgentTickets = store.maintenanceTickets.filter(
    (ticket) => ticket.status !== "resolved" && (ticket.priority === "urgent" || ticket.priority === "high"),
  );
  const recommendations: CopilotRecommendation[] = [];

  if (latePayments.length > 0) {
    const firstLatePayment = latePayments[0];
    const tenantName = getTenantFullName(firstLatePayment.tenantId, store) ?? getUnitLabel(firstLatePayment.unitId, store);
    recommendations.push({
      title: `Envoyer un rappel de paiement à ${tenantName}`,
      detail: `${getUnitLabel(firstLatePayment.unitId, store)} demande un suivi de loyer ce mois-ci.`,
      href: `/dashboard?property=${firstLatePayment.propertyId}&unit=${firstLatePayment.unitId}&tab=paiements`,
      priority: "issue",
    });
  }

  if (expiringLeases.length > 0) {
    const firstLease = expiringLeases[0];
    recommendations.push({
      title: "Préparer les avis de renouvellement à venir",
      detail: `${getUnitLabel(firstLease.unitId, store)} arrive à échéance le ${formatDate(firstLease.endDate)}.`,
      href: `/dashboard?property=${firstLease.propertyId}&unit=${firstLease.unitId}&tab=bail`,
      priority: "attention",
    });
  }

  if (urgentTickets.length > 0) {
    const firstTicket = urgentTickets[0];
    recommendations.push({
      title: `Planifier l'intervention pour ${firstTicket.title.toLowerCase()}`,
      detail: `${getUnitLabel(firstTicket.unitId, store)} a une demande d'entretien à prioriser.`,
      href: "/entretien",
      priority: "issue",
    });
  }

  if (recommendations.length < 3) {
    recommendations.push({
      title: "Revoir les prochaines échéances du portefeuille",
      detail: "Valider les baux, documents et paiements à surveiller avant la fin du mois.",
      href: "/calendrier",
      priority: "attention",
    });
  }

  if (recommendations.length < 3) {
    recommendations.push({
      title: "Consulter les demandes d'entretien ouvertes",
      detail: "Confirmer qu'aucune demande non urgente ne bloque un logement.",
      href: "/entretien",
      priority: "ok",
    });
  }

  const summaryText =
    latePayments.length === 0 && expiringLeases.length === 0 && urgentTickets.length === 0
      ? "Votre portefeuille est globalement stable. Les paiements, les baux et les demandes d'entretien ne présentent pas d'urgence majeure."
      : `Votre portefeuille reste maîtrisé, mais ${latePayments.length} paiement${latePayments.length > 1 ? "s" : ""} en retard, ${expiringLeases.length} bail${expiringLeases.length > 1 ? "s" : ""} à surveiller et ${urgentTickets.length} demande${urgentTickets.length > 1 ? "s" : ""} urgente${urgentTickets.length > 1 ? "s" : ""} demandent votre attention.`;

  return {
    summaryText,
    recommendations: recommendations.slice(0, 3),
  };
}

function getTodayIsoDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

function isLeaseExpiringSoon(date: string) {
  const now = new Date();
  const leaseEnd = new Date(`${date}T12:00:00`);
  const days = Math.ceil((leaseEnd.getTime() - now.getTime()) / 86_400_000);
  return days >= 0 && days <= 90;
}

function getUnitLabel(unitId: string, store: LocalStore) {
  return store.units.find((unit) => unit.id === unitId)?.label ?? "Logement";
}

function getTenantFullName(tenantId: string | null | undefined, store: LocalStore) {
  const tenant = tenantId ? store.tenants.find((candidate) => candidate.id === tenantId) : null;
  return tenant ? `${tenant.firstName} ${tenant.lastName}` : null;
}

export default function Home() {
  const { setStore } = useLocalStore();
  const { data, loading: snapshotLoading, error: snapshotError, refresh: refreshPortfolioSnapshot } = usePortfolioSnapshot();
  const dashboardStore = data ?? emptyPortfolioStore;
  const initialRoute = getInitialDashboardRoute();
  const propertyDashboards = useMemo(() => getPropertyDashboards(dashboardStore), [dashboardStore]);
  const portfolioSummary = useMemo(() => getPortfolioSummary(dashboardStore), [dashboardStore]);
  const notifications = useMemo(() => getNotificationItems(dashboardStore), [dashboardStore]);
  const recentActivities = useMemo(() => getRecentActivities(dashboardStore, 5), [dashboardStore]);
  const copilotSummary = useMemo(() => getCopilotSummary(dashboardStore), [dashboardStore]);
  const upcomingTasks = useMemo(() => getUpcomingTasks(dashboardStore.tasks, 3), [dashboardStore.tasks]);
  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);
  const [taskSuccessVisible, setTaskSuccessVisible] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialRoute.propertyId ?? "");
  const selectedProperty = useMemo(
    () => propertyDashboards.find((property) => property.id === selectedPropertyId) ?? propertyDashboards[0],
    [propertyDashboards, selectedPropertyId],
  );
  const [selectedUnitId, setSelectedUnitId] = useState(initialRoute.unitId ?? selectedProperty?.units[0]?.id ?? "");
  const [unitDrawerOpen, setUnitDrawerOpen] = useState(Boolean(initialRoute.unitId));
  const [unitDrawerTab, setUnitDrawerTab] = useState<UnitDrawerTab>(
    isUnitDrawerTab(initialRoute.tab) ? initialRoute.tab : "resume",
  );

  const selectedUnit = useMemo(
    () => selectedProperty?.units.find((unit) => unit.id === selectedUnitId) ?? selectedProperty?.units[0],
    [selectedProperty?.units, selectedUnitId],
  );
  const selectedUnitDocuments = useMemo(
    () => (selectedUnit ? dashboardStore.documents.filter((document) => document.unitId === selectedUnit.id) : []),
    [dashboardStore.documents, selectedUnit],
  );

  async function refreshDashboardSnapshot() {
    try {
      await refreshPortfolioSnapshot();
    } catch (error) {
      console.error("Impossible de rafraîchir les données du tableau de bord.", error);
    }
  }

  function selectProperty(propertyId: string) {
    const nextProperty = propertyDashboards.find((property) => property.id === propertyId) ?? propertyDashboards[0];
    setSelectedPropertyId(propertyId);
    setSelectedUnitId(nextProperty.units[0]?.id ?? "");
    setUnitDrawerOpen(false);
    setUnitDrawerTab("resume");
  }

  function selectUnit(unitId: string) {
    setSelectedUnitId(unitId);
    setUnitDrawerTab("resume");
    setUnitDrawerOpen(true);
  }

  async function createQuickTask(form: QuickTaskForm) {
    const title = form.title.trim();

    if (!title) {
      return;
    }

    const now = new Date().toISOString();
    const propertyId = form.propertyId || selectedProperty?.id || dashboardStore.properties[0]?.id;
    const unit = form.unitId ? dashboardStore.units.find((candidate) => candidate.id === form.unitId) : null;
    const occupancy = unit ? getUnitOccupancy(unit, dashboardStore.leases, dashboardStore.tenants) : null;
    const tenantId = form.tenantId || occupancy?.tenantId || null;
    let task: AppTask;

    try {
      task = await createTaskRecord({
        title,
        description: form.description.trim(),
        completed: false,
        priority: form.priority,
        dueDate: form.dueDate || now.slice(0, 10),
        propertyId: propertyId || undefined,
        unitId: form.unitId || undefined,
        tenantId,
        createdAt: now,
      });

      setStore((current) => ({
        ...current,
        tasks: upsertTaskInStore(current.tasks, task),
      }));
      void refreshDashboardSnapshot();
    } catch (error) {
      console.error("Impossible de créer la tâche.", error);
      return;
    }

    try {
      const activity = await createActivityRecord({
        propertyId: propertyId || dashboardStore.properties[0]?.id || "",
        unitId: task.unitId,
        tenantId: task.tenantId,
        type: "tache",
        title: "Tâche personnelle créée",
        description: `La tâche personnelle « ${task.title} » a été créée.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      void refreshDashboardSnapshot();
    } catch (error) {
      console.error("Impossible de créer l'activité de tâche.", error);
    }
    setQuickTaskModalOpen(false);
    setTaskSuccessVisible(true);
    window.setTimeout(() => setTaskSuccessVisible(false), 2200);
  }

  if (!selectedProperty || !selectedUnit) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
          <AppHeader />
          <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-sm font-semibold text-[var(--muted)]">
              {snapshotLoading ? "Chargement du portefeuille..." : "Aucune donnée de portefeuille disponible."}
            </p>
            {snapshotError ? <p className="mt-2 text-sm text-[color:var(--yellow)]">{snapshotError}</p> : null}
            {snapshotError ? (
              <button className="btn-secondary mt-4" onClick={() => void refreshPortfolioSnapshot()} type="button">
                Réessayer
              </button>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <AppHeader />

        <header className="flex flex-col gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">Vue globale · Portefeuille locatif québécois</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[var(--foreground)] sm:text-[2.5rem]">
              Tableau de bord
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Santé du portefeuille, revenus mensuels, demandes d&apos;entretien et baux à surveiller.
            </p>
            {snapshotLoading ? <p className="mt-3 text-xs font-semibold uppercase text-[var(--muted)]">Synchronisation du portefeuille...</p> : null}
            {snapshotError ? <p className="mt-3 text-sm font-semibold text-[color:var(--yellow)]">{snapshotError}</p> : null}
            <button className="btn-primary mt-4" onClick={() => exportPortfolioReport(dashboardStore)} type="button">
              Exporter le rapport portefeuille
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[680px] xl:grid-cols-5">
            <Metric label="Santé du portefeuille" value={portfolioSummary.healthScore.toString()} subtitle="En santé" />
            <Metric label="Loyer mensuel" value={currency.format(portfolioSummary.monthlyRent)} />
            <Metric label="Demandes d'entretien" value={portfolioSummary.openMaintenanceCount.toString()} />
            <Metric label="Enjeux urgents" value={portfolioSummary.urgentIssueCount.toString()} />
            <Metric label="Baux à surveiller" value={portfolioSummary.leasesExpiringSoon.toString()} />
          </div>
        </header>

        <CopilotCard summary={copilotSummary} />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="min-w-0">
            <BuildingCard
              property={selectedProperty}
              selectedUnitId={selectedUnitId}
              onSelect={selectUnit}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--muted)]">Immeuble sélectionné</p>
              <h2 className="mt-1 line-clamp-2 text-xl font-semibold text-[var(--foreground)] [overflow-wrap:anywhere] [word-break:normal]">{selectedProperty.name}</h2>
            </div>
            <div className="grid min-w-0 gap-2">
              {propertyDashboards.map((property) => (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => selectProperty(property.id)}
                  className={`min-w-0 rounded-lg border px-4 py-3 text-left transition ${
                    selectedPropertyId === property.id
                      ? "border-[color:var(--accent)] bg-[var(--surface-3)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[color:var(--accent)]/60"
                  }`}
                >
                  <p className="line-clamp-1 font-semibold text-[var(--foreground)] [overflow-wrap:anywhere] [word-break:normal]">{property.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)] [overflow-wrap:anywhere] [word-break:normal]">
                    {property.address}, {property.city}
                  </p>
                </button>
              ))}
            </div>
            <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--muted)]">Aperçu rapide</p>
                  <h3 className="mt-1 line-clamp-2 text-lg font-semibold text-[var(--foreground)] [overflow-wrap:anywhere] [word-break:normal]">
                    {selectedProperty.units.length} logements, {selectedProperty.city}
                  </h3>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                  Données MVP
                </span>
              </div>
              <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
                <SnapshotItem label="Occupation" value="100 %" />
                <SnapshotItem label="Loyer moyen" value={currency.format(Math.round(selectedProperty.monthlyRent / Math.max(selectedProperty.units.length, 1)))} />
                <SnapshotItem label="Cadre des baux" value="TAL du Québec" />
                <SnapshotItem label="Prochaine action" value={selectedProperty.issueCount > 0 ? "Suivi prioritaire" : "Aucune urgence"} />
              </div>
            </div>

            <div className="grid min-w-0 gap-3">
              {selectedProperty.units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => selectUnit(unit.id)}
                  className={`flex min-w-0 items-center justify-between gap-4 rounded-lg border p-4 text-left transition ${
                    selectedUnitId === unit.id
                      ? "border-[color:var(--accent)] bg-[var(--surface-3)] text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)] hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface)]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-semibold [overflow-wrap:anywhere] [word-break:normal]">{unit.label}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)] [overflow-wrap:anywhere] [word-break:normal]">
                      {getTenantName(unit)} - {currency.format(unit.monthlyRent)}/mois
                    </p>
                  </div>
                  <HealthBadge health={unit.health} compact />
                </button>
              ))}
            </div>
          </div>

          <DashboardSidePanel notifications={notifications} tasks={upcomingTasks} />
        </section>

        <section>
          <RecentActivityCard activities={recentActivities} />
        </section>
      </div>
      <button
        type="button"
        aria-label="Ajouter une tâche"
        onClick={() => setQuickTaskModalOpen(true)}
        className="group fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent)] text-3xl font-light leading-none text-white shadow-[0_18px_40px_rgba(37,99,255,0.35)] transition hover:-translate-y-0.5 hover:bg-[color:var(--accent)]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
      >
        <span aria-hidden="true" className="-mt-0.5">+</span>
        <span className="pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] opacity-0 shadow-[0_12px_32px_rgba(0,0,0,0.22)] transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Ajouter une tâche
        </span>
      </button>
      {taskSuccessVisible ? (
        <div className="fixed bottom-24 right-6 z-40 rounded-full border border-[color:var(--green)]/35 bg-[color:var(--green)]/10 px-4 py-2 text-sm font-semibold text-[color:var(--green)] shadow-[0_12px_30px_rgba(0,0,0,0.25)]">
          Tâche créée
        </div>
      ) : null}
      {quickTaskModalOpen ? (
        <QuickTaskModal
          onCancel={() => setQuickTaskModalOpen(false)}
          onCreate={createQuickTask}
          store={dashboardStore}
        />
      ) : null}
      <UnitDrawer
        unit={selectedUnit}
        documents={selectedUnitDocuments}
        notesSource={dashboardStore.notes}
        setStore={setStore}
        onDataChange={refreshDashboardSnapshot}
        open={unitDrawerOpen}
        activeTab={unitDrawerTab}
        onTabChange={setUnitDrawerTab}
        onClose={() => setUnitDrawerOpen(false)}
      />
    </main>
  );
}

function Metric({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{value}</p>
      {subtitle ? <p className="mt-1 text-xs font-semibold text-[color:var(--green)]">{subtitle}</p> : null}
    </div>
  );
}

type CopilotRecommendation = {
  title: string;
  detail: string;
  href: string;
  priority: Health;
};

type CopilotSummary = {
  summaryText: string;
  recommendations: CopilotRecommendation[];
};

type QuickTaskForm = {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
};

function CopilotCard({ summary }: { summary: CopilotSummary }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)] lg:items-start">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">Copilot Immo</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Résumé du portefeuille</h2>
            </div>
            <span className="rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--accent)]">
              Règles locales
            </span>
          </div>
          <p className="text-sm leading-6 text-[var(--muted)]">{summary.summaryText}</p>
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">Actions recommandées</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {summary.recommendations.map((recommendation) => (
              <Link
                key={recommendation.title}
                href={recommendation.href}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)]"
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${healthCopy[recommendation.priority].dot}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-[var(--foreground)]">{recommendation.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{recommendation.detail}</p>
                  </div>
                </div>
              </Link>
            ))}
            {summary.recommendations.length === 0 ? (
              <div className="rounded-lg border border-[color:var(--green)]/30 bg-[color:var(--green)]/10 p-3 text-sm font-medium text-[color:var(--green)]">
                Aucune recommandation prioritaire pour le moment.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function UpcomingTasksCard({ tasks }: { tasks: AppTask[] }) {
  return (
    <section className="w-full min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted)]">Mes tâches</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">À venir</h2>
        </div>
        <Link className="btn-secondary shrink-0" href="/taches">
          Voir toutes les tâches
        </Link>
      </div>
      <div className="mt-4 grid min-w-0 gap-2">
        {tasks.map((task) => (
          <div key={task.id} className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="line-clamp-2 font-semibold text-[var(--foreground)] [overflow-wrap:anywhere] [word-break:normal]">{task.title}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Échéance {formatDate(task.dueDate)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                {task.priority}
              </span>
            </div>
          </div>
        ))}
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
            Aucune tâche personnelle à venir.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function QuickTaskModal({
  onCancel,
  onCreate,
  store,
}: {
  onCancel: () => void;
  onCreate: (form: QuickTaskForm) => void | Promise<void>;
  store: LocalStore;
}) {
  const [form, setForm] = useState<QuickTaskForm>({
    title: "",
    description: "",
    priority: "moyenne",
    dueDate: "",
    propertyId: "",
    unitId: "",
    tenantId: "",
  });
  const availableUnits = store.units.filter((unit) => !form.propertyId || unit.propertyId === form.propertyId);
  const selectedUnit = store.units.find((unit) => unit.id === form.unitId);
  const availableTenants = store.tenants.filter((tenant) => {
    const selectedOccupancy = selectedUnit ? getUnitOccupancy(selectedUnit, store.leases, store.tenants) : null;

    if (selectedOccupancy?.tenantId) {
      return tenant.id === selectedOccupancy.tenantId;
    }

    if (!form.propertyId) {
      return true;
    }

    return store.units.some((unit) => {
      const occupancy = getUnitOccupancy(unit, store.leases, store.tenants);
      return unit.propertyId === form.propertyId && occupancy.tenantId === tenant.id;
    });
  });

  function updateProperty(propertyId: string) {
    setForm({ ...form, propertyId, unitId: "", tenantId: "" });
  }

  function updateUnit(unitId: string) {
    const unit = store.units.find((candidate) => candidate.id === unitId);
    const occupancy = unit ? getUnitOccupancy(unit, store.leases, store.tenants) : null;
    setForm({ ...form, unitId, tenantId: occupancy?.tenantId ?? "" });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Mes tâches</p>
            <h2 className="mt-1 text-2xl font-semibold">Nouvelle tâche rapide</h2>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-xl leading-none text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <TextInput label="Titre" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Description optionnelle
            <textarea
              className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              label="Priorité"
              value={form.priority}
              onChange={(priority) => setForm({ ...form, priority: priority as TaskPriority })}
              options={[
                ["faible", "Faible"],
                ["moyenne", "Moyenne"],
                ["élevée", "Élevée"],
              ]}
            />
            <TextInput
              label="Date d'échéance optionnelle"
              type="date"
              value={form.dueDate}
              onChange={(dueDate) => setForm({ ...form, dueDate })}
            />
          </div>
          <SelectInput
            label="Immeuble optionnel"
            value={form.propertyId}
            onChange={updateProperty}
            options={[["", "Aucun"], ...store.properties.map((property) => [property.id, property.name])]}
          />
          <SelectInput
            label="Logement optionnel"
            value={form.unitId}
            onChange={updateUnit}
            options={[["", "Aucun"], ...availableUnits.map((unit) => [unit.id, unit.label])]}
          />
          <SelectInput
            label="Locataire optionnel"
            value={form.tenantId}
            onChange={(tenantId) => setForm({ ...form, tenantId })}
            options={[["", "Aucun"], ...availableTenants.map((tenant) => [tenant.id, `${tenant.firstName} ${tenant.lastName}`])]}
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!form.title.trim()} onClick={() => onCreate(form)} type="button">
            Créer la tâche
          </button>
        </div>
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

function RecentActivityCard({ activities }: { activities: UnitActivity[] }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">Activité récente</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--foreground)]">Derniers événements</h2>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          5 derniers
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {activities.map((activity) => (
          <div key={activity.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-[var(--foreground)]">{activity.title}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{activity.description}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold uppercase text-[var(--muted)]">
                {activity.type} · {formatDate(activity.date)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function getUpcomingTasks(tasks: AppTask[], limit: number) {
  return tasks
    .filter((task) => !task.completed)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

function upsertTaskInStore(tasks: AppTask[], task: AppTask) {
  return tasks.some((candidate) => candidate.id === task.id)
    ? tasks.map((candidate) => (candidate.id === task.id ? task : candidate))
    : [task, ...tasks];
}

function BuildingCard({
  property,
  selectedUnitId,
  onSelect,
}: {
  property: PropertyDashboard;
  selectedUnitId: string;
  onSelect: (unitId: string) => void;
}) {
  const usesGridTwin = property.propertyType === "immeuble" || property.units.length >= 5;

  return (
    <div className="relative flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-5 sm:min-h-[620px] sm:p-6">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[length:24px_24px]" />
      {!usesGridTwin ? (
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--muted)]">Jumeau numérique</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--foreground)]">{property.name}</h3>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            {property.units.length} {property.units.length > 1 ? "logements actifs" : "logement actif"}
          </span>
        </div>
      ) : null}

      <PropertyVisual property={property} selectedUnitId={selectedUnitId} onSelect={onSelect} />
    </div>
  );
}

function PropertyVisual({
  property,
  selectedUnitId,
  onSelect,
}: {
  property: PropertyDashboard;
  selectedUnitId: string;
  onSelect: (unitId: string) => void;
}) {
  return (
    <div className="relative z-10 mt-3 flex flex-1 items-start justify-center">
      <BuildingVisual
        type={property.propertyType}
        propertyName={property.name}
        units={property.units}
        selectedUnitId={selectedUnitId}
        onSelectUnit={onSelect}
      />
    </div>
  );
}

function DashboardSidePanel({ notifications, tasks }: { notifications: NotificationItem[]; tasks: AppTask[] }) {
  return (
    <aside className="flex w-full min-w-0 flex-col gap-4 overflow-hidden lg:sticky lg:top-5">
      <NotificationsPanel notifications={notifications} />
      <UpcomingTasksCard tasks={tasks} />
    </aside>
  );
}

function NotificationsPanel({ notifications }: { notifications: NotificationItem[] }) {
  const topNotifications = notifications.slice(0, 5);

  return (
    <section className="flex max-h-[620px] w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted)]">Centre de vigilance</p>
          <h2 className="mt-1 line-clamp-2 text-xl font-semibold text-[var(--foreground)] [overflow-wrap:anywhere] [word-break:normal]">Notifications prioritaires</h2>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          Top 5
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
        Alertes actives générées à partir des paiements, baux, demandes d&apos;entretien et documents du portefeuille.
      </p>
      <div className="custom-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <NotificationList notifications={topNotifications} compact />
      </div>
      {notifications.length > topNotifications.length ? (
        <Link
          href="/notifications"
          className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-center text-sm font-semibold text-[var(--foreground)] transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]"
        >
          Voir toutes les notifications
        </Link>
      ) : null}
    </section>
  );
}

type UnitDrawerTab = "resume" | "bail" | "paiements" | "historique" | "documents" | "notes";

function isUnitDrawerTab(value: string | null): value is UnitDrawerTab {
  return value === "resume" || value === "bail" || value === "paiements" || value === "historique" || value === "documents" || value === "notes";
}

function UnitDrawer({
  activeTab,
  documents,
  notesSource,
  open,
  setStore,
  onDataChange,
  unit,
  onTabChange,
  onClose,
}: {
  activeTab: UnitDrawerTab;
  documents: PropertyDocument[];
  notesSource: AppNote[];
  open: boolean;
  setStore: (updater: LocalStore | ((current: LocalStore) => LocalStore)) => void;
  onDataChange: () => void;
  unit: UnitDashboard;
  onTabChange: (tab: UnitDrawerTab) => void;
  onClose: () => void;
}) {
  const activities = useMemo(
    () =>
      [...unit.activities].sort(
        (a, b) => new Date(`${b.date}T12:00:00`).getTime() - new Date(`${a.date}T12:00:00`).getTime(),
      ),
    [unit.activities],
  );

  return (
    <div
      className={`fixed inset-0 z-50 transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Fermer le panneau"
        onClick={onClose}
        className={`absolute inset-0 bg-black/55 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`custom-scrollbar absolute right-0 top-0 h-full w-full max-w-[480px] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-5 shadow-[-24px_0_60px_rgba(0,0,0,0.32)] transition-transform duration-300 ease-out sm:w-[460px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={`Détails du ${unit.label}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">{unit.floor}</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{unit.label}</h2>
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

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-1 sm:grid-cols-3">
          <DrawerTabButton active={activeTab === "resume"} onClick={() => onTabChange("resume")}>
            Résumé
          </DrawerTabButton>
          <DrawerTabButton active={activeTab === "bail"} onClick={() => onTabChange("bail")}>
            Bail
          </DrawerTabButton>
          <DrawerTabButton active={activeTab === "paiements"} onClick={() => onTabChange("paiements")}>
            Paiements
          </DrawerTabButton>
          <DrawerTabButton active={activeTab === "historique"} onClick={() => onTabChange("historique")}>
            Historique
          </DrawerTabButton>
          <DrawerTabButton active={activeTab === "documents"} onClick={() => onTabChange("documents")}>
            Documents
          </DrawerTabButton>
          <DrawerTabButton active={activeTab === "notes"} onClick={() => onTabChange("notes")}>
            Notes
          </DrawerTabButton>
        </div>

        {activeTab === "resume" ? <UnitSummary unit={unit} /> : null}
        {activeTab === "bail" ? <UnitLease unit={unit} /> : null}
        {activeTab === "paiements" ? <UnitPayments payments={unit.payments} /> : null}
        {activeTab === "historique" ? <UnitTimeline activities={activities} /> : null}
        {activeTab === "documents" ? <UnitDocuments documents={documents} onDataChange={onDataChange} setStore={setStore} unit={unit} /> : null}
        {activeTab === "notes" ? (
          <div className="mt-6">
            <NotesPanel
              notesSource={notesSource}
              onChanged={onDataChange}
              propertyId={unit.propertyId}
              targetId={unit.id}
              targetType="logement"
              tenantId={unit.tenantId}
              title={`Notes · ${unit.label}`}
              unitId={unit.id}
            />
          </div>
        ) : null}
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
  children: ReactNode;
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

function UnitSummary({ unit }: { unit: UnitDashboard }) {
  return (
    <>
      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <p className="text-xs font-medium uppercase text-[var(--muted)]">Statut</p>
        <div className="mt-2">
          <HealthBadge health={unit.health} />
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <DetailItem label="Locataire" value={getTenantName(unit)} />
        <DetailItem label="Loyer" value={`${currency.format(unit.monthlyRent)} / mois`} />
        <DetailItem label="Statut paiement" value={paymentStatusLabel[unit.paymentStatus]} />
        <DetailItem label="Fin du bail" value={unit.leaseEndDate} />
        <DetailItem label="Demandes d'entretien ouvertes" value={unit.openTickets.length.toString()} />
      </div>
      <div className="mt-4">
        <TaskComposer
          compact
          propertyId={unit.propertyId}
          tenantId={unit.tenantId}
          title={`Créer une tâche personnelle · ${unit.label}`}
          unitId={unit.id}
        />
      </div>
    </>
  );
}

function UnitTimeline({ activities }: { activities: UnitDashboard["activities"] }) {
  if (activities.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm font-medium text-[var(--muted)]">
        Aucun historique pour ce logement.
      </p>
    );
  }

  return (
    <ol className="mt-6 space-y-3">
      {activities.map((activity) => (
        <li key={activity.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--foreground)]">{activity.title}</p>
              <p className="mt-1 text-xs font-semibold uppercase text-[var(--muted)]">
                {activity.type} · {formatDate(activity.date)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{activity.description}</p>
        </li>
      ))}
    </ol>
  );
}

function UnitDocuments({
  documents,
  onDataChange,
  setStore,
  unit,
}: {
  documents: PropertyDocument[];
  onDataChange: () => void;
  setStore: (updater: LocalStore | ((current: LocalStore) => LocalStore)) => void;
  unit: UnitDashboard;
}) {
  const [documentType, setDocumentType] = useState<PropertyDocument["type"]>("bail");

  async function uploadDocument(file: File) {
    const now = new Date().toISOString();
    try {
      const document = await createDocumentWithFile(
        {
          name: file.name,
          type: documentType,
          propertyId: unit.propertyId,
          unitId: unit.id,
          relatedEntityType: documentType === "paiement" ? "paiement" : documentType === "bail" ? "bail" : "logement",
          relatedEntityId: unit.id,
          uploadDate: now.slice(0, 10),
          uploadedAt: now,
        },
        file,
      );

      setStore((current) => ({
        ...current,
        documents: upsertDocumentInStore(current.documents, document),
      }));
      onDataChange();

      const activity = await createActivityRecord({
        propertyId: unit.propertyId,
        unitId: unit.id,
        tenantId: unit.tenantId,
        type: "document",
        title: "Document téléversé",
        description: `${document.name} a été téléversé pour ${unit.label}.`,
        date: document.uploadDate,
      });

      setStore((current) => addActivityToStore(current, activity));
      onDataChange();
    } catch (error) {
      console.error("Impossible de créer le document ou son activité.", error);
    }
  }

  async function deleteDocument(document: PropertyDocument) {
    if (!window.confirm(`Supprimer le document « ${document.name} » ?`)) {
      return;
    }

    try {
      await deleteDocumentRecord(document.id);

      setStore((current) => ({
        ...current,
        documents: current.documents.filter((candidate) => candidate.id !== document.id),
      }));
      onDataChange();

      const activity = await createActivityRecord({
        propertyId: unit.propertyId,
        unitId: unit.id,
        tenantId: unit.tenantId,
        type: "document",
        title: "Document supprimé",
        description: `${document.name} a été supprimé du dossier de ${unit.label}.`,
      });

      setStore((current) => addActivityToStore(current, activity));
      onDataChange();
    } catch (error) {
      console.error("Impossible de supprimer le document ou de créer son activité.", error);
    }
  }

  return (
    <div className="mt-6 grid gap-3">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <p className="font-semibold text-[var(--foreground)]">Téléverser un document</p>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Type
            <select
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as PropertyDocument["type"])}
            >
              {Object.entries(documentTypeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <input
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void uploadDocument(file);
                event.currentTarget.value = "";
              }
            }}
          />
        </div>
      </div>

      {documents.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm font-medium text-[var(--muted)]">
          Aucun document associé à ce logement.
        </p>
      ) : null}

      {documents.map((document) => (
        <div key={document.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--foreground)]">{document.name}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {documentTypeLabel[document.type]} · Téléversé le {formatDate(document.uploadDate)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DocumentFileActions document={document} />
              <button className="btn-danger" onClick={() => deleteDocument(document)} type="button">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ))}
      <Link
        href="/documents"
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground)] transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]"
      >
        Voir tous les documents
      </Link>
    </div>
  );
}

function upsertDocumentInStore(documents: PropertyDocument[], document: PropertyDocument) {
  return documents.some((candidate) => candidate.id === document.id)
    ? documents.map((candidate) => (candidate.id === document.id ? document : candidate))
    : [...documents, document];
}

function UnitPayments({ payments }: { payments: UnitDashboard["payments"] }) {
  const sortedPayments = [...payments].sort((a, b) => b.month.localeCompare(a.month));

  if (sortedPayments.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm font-medium text-[var(--muted)]">
        Aucun paiement associé à ce logement.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-3">
      {sortedPayments.map((payment) => (
        <div key={payment.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-[var(--foreground)]">{payment.month}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Échéance: {payment.dueDate}</p>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
              {rentPaymentStatusLabel[payment.status]}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <SnapshotItem label="Montant dû" value={currency.format(payment.amountDue)} />
            <SnapshotItem label="Montant payé" value={currency.format(payment.amountPaid)} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{payment.notes}</p>
        </div>
      ))}
      <Link
        href="/paiements"
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground)] transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]"
      >
        Ouvrir la page des paiements
      </Link>
    </div>
  );
}

function UnitLease({ unit }: { unit: UnitDashboard }) {
  const renewalStatus =
    unit.paymentStatus === "late" ? "Action requise" : unit.paymentStatus === "dueSoon" ? "À surveiller" : "À jour";

  return (
    <div className="mt-6 grid gap-3">
      <DetailItem label="Date de début" value={unit.leaseStartDate} />
      <DetailItem label="Date de fin" value={unit.leaseEndDate} />
      <DetailItem label="Montant du loyer" value={`${currency.format(unit.monthlyRent)} / mois`} />
      <DetailItem label="Statut paiement" value={paymentStatusLabel[unit.paymentStatus]} />
      <DetailItem label="Statut de renouvellement" value={renewalStatus} />
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <p className="text-xs font-medium uppercase text-[var(--muted)]">Notes</p>
        <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{unit.notes}</p>
      </div>
      <Link
        href="/baux"
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-center text-sm font-semibold text-[var(--foreground)] transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]"
      >
        Ouvrir la page des baux
      </Link>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
      <p className="text-xs font-medium uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function HealthBadge({ health, compact = false }: { health: Health; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border font-semibold ${healthCopy[health].classes} ${
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${healthCopy[health].dot}`} />
      {healthCopy[health].label}
    </span>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { buildRentLedger, type RentChargeRow } from "@/lib/data/rentLedgerService";
import { isLeaseCurrent } from "@/lib/data/leaseAdapters";
import { currency, getNotificationItems, getPropertyName, getRecentActivities, getUnitLabel } from "@/lib/mockData";
import type { LocalStore, NotificationItem, PaymentTransaction, Property, UnitActivity } from "@/lib/types";

type ChartRange = 6 | 12;
type DashboardTone = "blue" | "green" | "orange" | "red" | "purple";

type DashboardMonth = {
  key: string;
  label: string;
  expected: number;
  received: number;
};

type PriorityAction = {
  id: string;
  title: string;
  context: string;
  dueDate: string;
  amountOrDate: string;
  priority: "urgent" | "attention" | "info";
  actionLabel: string;
  href: string;
};

type PropertySummary = {
  id: string;
  name: string;
  unitCount: number;
  received: number;
  occupancyRate: number;
  href: string;
};

type DashboardModel = {
  month: string;
  monthLabel: string;
  previousMonthLabel: string;
  kpis: {
    receivedThisMonth: number;
    receivedTrend: number | null;
    remainingBalance: number;
    overdueRentCount: number;
    occupancyRate: number;
    occupiedUnits: number;
    totalUnits: number;
    openMaintenanceCount: number;
    urgentMaintenanceCount: number;
  };
  chartMonths: DashboardMonth[];
  actions: PriorityAction[];
  recentActivities: UnitActivity[];
  propertySummaries: PropertySummary[];
};

const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const shortMonthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

export default function DashboardPage() {
  const { data, error, isReady, isSupabaseMode, loading, refresh } = usePortfolioSnapshot();
  const [today, setToday] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("all");
  const [chartRange, setChartRange] = useState<ChartRange>(6);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentDate = getTodayIsoDate();
      setToday(currentDate);
      setSelectedMonth(currentDate.slice(0, 7));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const showLoader = loading || !today || !selectedMonth || !isReady;
  const store = data;

  const model = useMemo(
    () => (store && today && selectedMonth ? buildDashboardModel(store, today, selectedMonth, selectedPropertyId, chartRange) : null),
    [chartRange, selectedMonth, selectedPropertyId, store, today],
  );

  async function refreshDashboard() {
    try {
      await refresh();
    } catch (refreshError) {
      console.error("Impossible de rafraîchir les données du tableau de bord.", refreshError);
    }
  }

  if (showLoader) {
    return <DashboardSkeleton />;
  }

  if (error && isSupabaseMode) {
    return (
      <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-xl font-semibold">Impossible de charger les données du portefeuille.</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Réessayez pour recharger les données Supabase.</p>
        <button className="btn-primary mt-4" onClick={() => void refreshDashboard()} type="button">
          Réessayer
        </button>
      </section>
    );
  }

  if (!store || !model || store.properties.length === 0) {
    return (
      <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-xl font-semibold">Aucune donnée de portefeuille disponible.</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Ajoutez un immeuble ou utilisez les données démo pour remplir le tableau de bord.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
        <DashboardTitleBar
          month={selectedMonth}
          monthLabel={model.monthLabel}
          onMonthChange={setSelectedMonth}
          onRefresh={refreshDashboard}
          onPropertyChange={setSelectedPropertyId}
          properties={store.properties}
          selectedPropertyId={selectedPropertyId}
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon="$"
            title="Revenus reçus"
            subtitle="Ce mois-ci"
            value={currency.format(model.kpis.receivedThisMonth)}
            helper={formatTrend(model.kpis.receivedTrend, model.previousMonthLabel)}
            tone="blue"
          />
          <KpiCard
            icon="▭"
            title="À recevoir"
            subtitle="Solde à percevoir"
            value={currency.format(model.kpis.remainingBalance)}
            helper={model.kpis.overdueRentCount > 0 ? `${model.kpis.overdueRentCount} loyer${model.kpis.overdueRentCount > 1 ? "s" : ""} en retard` : "Aucun loyer en retard"}
            tone={model.kpis.overdueRentCount > 0 ? "orange" : "green"}
          />
          <KpiCard
            icon="▥"
            progress={model.kpis.occupancyRate}
            title="Occupation"
            subtitle="Taux d’occupation"
            value={`${model.kpis.occupancyRate} %`}
            helper={`${model.kpis.occupiedUnits} / ${model.kpis.totalUnits} logements occupés`}
            tone="purple"
          />
          <KpiCard
            icon="⌁"
            title="Entretien"
            subtitle="Demandes ouvertes"
            value={`${model.kpis.openMaintenanceCount}`}
            helper={
              model.kpis.urgentMaintenanceCount > 0
                ? `${model.kpis.urgentMaintenanceCount} urgente${model.kpis.urgentMaintenanceCount > 1 ? "s" : ""}`
                : "Aucune urgence"
            }
            tone={model.kpis.urgentMaintenanceCount > 0 ? "red" : "orange"}
          />
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
          <RevenueChartCard months={model.chartMonths} range={chartRange} onRangeChange={setChartRange} />
          <PriorityActionsCard actions={model.actions} />
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
          <RecentActivityTable activities={model.recentActivities} store={store} />
          <PropertiesCard properties={model.propertySummaries} />
        </section>
    </div>
  );
}

function DashboardTitleBar({
  month,
  monthLabel,
  onMonthChange,
  onPropertyChange,
  onRefresh,
  properties,
  selectedPropertyId,
}: {
  month: string;
  monthLabel: string;
  onMonthChange: (month: string) => void;
  onPropertyChange: (propertyId: string) => void;
  onRefresh: () => Promise<void>;
  properties: Property[];
  selectedPropertyId: string;
}) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-normal text-[var(--foreground)]">Tableau de bord</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Vue d’ensemble de votre portefeuille immobilier</p>
      </div>

      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
        <MonthControl month={month} monthLabel={monthLabel} onChange={onMonthChange} />
        <label className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold">
          <span className="text-[var(--muted)]">⌂</span>
          <select
            className="min-w-0 bg-transparent text-[var(--foreground)] outline-none"
            onChange={(event) => onPropertyChange(event.target.value)}
            value={selectedPropertyId}
          >
            <option value="all">Tous les immeubles</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label="Actualiser le tableau de bord"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-lg font-semibold transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]"
          onClick={() => void onRefresh()}
          type="button"
        >
          ↻
        </button>
      </div>
    </header>
  );
}

function MonthControl({ month, monthLabel, onChange }: { month: string; monthLabel: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
      <button className="rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]" onClick={() => onChange(addMonthsToMonth(month, -1))} type="button">
        ‹
      </button>
      <button className="min-w-32 rounded-md px-3 py-1.5 text-sm font-semibold text-[var(--foreground)]" onClick={() => onChange(getTodayIsoDate().slice(0, 7))} type="button">
        {monthLabel}
      </button>
      <button className="rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]" onClick={() => onChange(addMonthsToMonth(month, 1))} type="button">
        ›
      </button>
    </div>
  );
}

function KpiCard({
  helper,
  icon,
  progress,
  subtitle,
  title,
  tone,
  value,
}: {
  helper: string;
  icon: string;
  progress?: number;
  subtitle: string;
  title: string;
  tone: DashboardTone;
  value: string;
}) {
  const classes = getToneClasses(tone);

  return (
    <article className={`min-w-0 rounded-[18px] border bg-[var(--surface)] p-5 ${classes.card}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-bold ${classes.icon}`}>{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">{title}</h2>
          <p className="mt-1 truncate text-sm text-[var(--muted)]">{subtitle}</p>
        </div>
      </div>
      <p className="mt-5 truncate text-3xl font-bold tracking-normal text-[var(--foreground)]">{value}</p>
      <p className={`mt-3 line-clamp-1 text-sm font-semibold ${classes.helper}`}>{helper}</p>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div className={`h-full rounded-full ${classes.progress}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      ) : null}
    </article>
  );
}

function RevenueChartCard({
  months,
  onRangeChange,
  range,
}: {
  months: DashboardMonth[];
  onRangeChange: (range: ChartRange) => void;
  range: ChartRange;
}) {
  const maxAmount = Math.max(1, ...months.flatMap((item) => [item.expected, item.received]));
  const yAxis = [8000, 6000, 4000, 2000, 0].filter((value) => value <= Math.max(8000, Math.ceil(maxAmount / 1000) * 1000));

  return (
    <section className="min-w-0 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Loyers attendus vs reçus</h2>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[var(--muted)]">
            <LegendDot className="bg-[color:var(--accent)]" label="Loyers attendus" />
            <LegendDot className="bg-[color:var(--green)]" label="Loyers reçus" />
          </div>
        </div>
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold outline-none"
          onChange={(event) => onRangeChange(Number(event.target.value) as ChartRange)}
          value={range}
        >
          <option value={6}>6 derniers mois</option>
          <option value={12}>12 derniers mois</option>
        </select>
      </div>

      <div className="mt-5 grid min-h-[295px] grid-cols-[46px_minmax(0,1fr)] gap-3">
        <div className="flex flex-col justify-between pb-8 pt-3 text-xs text-[var(--muted)]">
          {yAxis.map((value) => (
            <span key={value}>{formatCompactAmount(value)}</span>
          ))}
        </div>
        <div className="relative min-w-0 overflow-hidden rounded-xl">
          <div className="absolute inset-x-0 top-3 grid h-[220px] grid-rows-4">
            <span className="border-t border-[var(--border)]/75" />
            <span className="border-t border-[var(--border)]/75" />
            <span className="border-t border-[var(--border)]/75" />
            <span className="border-t border-[var(--border)]/75" />
          </div>
          <div className="relative flex h-[260px] min-w-0 items-end gap-3 px-1 pb-8 pt-3">
            {months.map((month) => (
              <div key={month.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <div className="flex h-[220px] w-full max-w-[72px] items-end justify-center gap-2">
                  <span
                    className="w-full rounded-t-md bg-[color:var(--accent)] shadow-[0_0_20px_rgba(37,99,235,0.18)]"
                    title={`Attendus: ${currency.format(month.expected)}`}
                    style={{ height: `${getBarHeight(month.expected, maxAmount)}%` }}
                  />
                  <span
                    className="w-full rounded-t-md bg-[color:var(--green)] shadow-[0_0_20px_rgba(34,197,94,0.12)]"
                    title={`Reçus: ${currency.format(month.received)}`}
                    style={{ height: `${getBarHeight(month.received, maxAmount)}%` }}
                  />
                </div>
                <span className="w-full truncate text-center text-xs text-[var(--muted)]">{month.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PriorityActionsCard({ actions }: { actions: PriorityAction[] }) {
  return (
    <section className="min-w-0 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <h2 className="text-lg font-bold">À traiter</h2>
        <Link className="text-sm font-semibold text-[color:var(--accent)] hover:underline" href="/notifications">
          Voir tout ({actions.length})
        </Link>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {actions.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-semibold text-[color:var(--green)]">Tout est à jour</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Aucune action urgente pour le moment.</p>
          </div>
        ) : (
          actions.map((action) => <PriorityActionRow key={action.id} action={action} />)
        )}
      </div>
    </section>
  );
}

function PriorityActionRow({ action }: { action: PriorityAction }) {
  const tone = action.priority === "urgent" ? "red" : action.priority === "attention" ? "orange" : "blue";
  const classes = getToneClasses(tone);

  return (
    <article className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-3">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${classes.icon}`}>{getActionIcon(action.title)}</span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-bold text-[var(--foreground)]">{action.title}</h3>
        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{action.context}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className={`hidden min-w-16 text-right text-sm font-bold sm:block ${classes.helper}`}>{action.amountOrDate}</span>
        <Link className="rounded-lg border border-[color:var(--accent)]/45 px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[color:var(--accent)]/15" href={action.href}>
          {action.actionLabel}
        </Link>
      </div>
    </article>
  );
}

function RecentActivityTable({ activities, store }: { activities: UnitActivity[]; store: LocalStore }) {
  return (
    <section className="min-w-0 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Activité récente</h2>
        <Link className="text-sm font-semibold text-[color:var(--accent)] hover:underline" href="/activites">
          Voir toute l’activité
        </Link>
      </div>

      <div className="mt-5 hidden overflow-hidden md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead className="text-left text-xs text-[var(--muted)]">
            <tr>
              <th className="w-[25%] px-3 py-2 font-medium">Événement</th>
              <th className="w-[25%] px-3 py-2 font-medium">Immeuble / Logement</th>
              <th className="w-[14%] px-3 py-2 font-medium">Date</th>
              <th className="w-[16%] px-3 py-2 font-medium">Personne</th>
              <th className="w-[10%] px-3 py-2 text-right font-medium">Montant</th>
              <th className="w-[10%] px-3 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} store={store} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-3 md:hidden">
        {activities.map((activity) => (
          <Link key={activity.id} href={getActivityHref(activity)} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="font-semibold">{activity.title}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">{getActivityContext(activity, store)}</p>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-[var(--muted)]">
              <span>{formatDate(activity.date)}</span>
              <span>{getActivityStatusLabel(activity)}</span>
            </div>
          </Link>
        ))}
      </div>

      {activities.length === 0 ? <p className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">Aucune activité récente.</p> : null}
    </section>
  );
}

function ActivityRow({ activity, store }: { activity: UnitActivity; store: LocalStore }) {
  return (
    <tr className="transition hover:bg-white/[0.03]">
      <td className="min-w-0 px-3 py-3">
        <Link href={getActivityHref(activity)} className="group flex min-w-0 items-center gap-3">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${getActivityIconClass(activity.type)}`}>
            {activity.type.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate font-semibold transition group-hover:text-[color:var(--accent)]">{activity.title}</span>
        </Link>
      </td>
      <td className="px-3 py-3 text-[var(--muted)]">
        <span className="line-clamp-1">{getActivityContext(activity, store)}</span>
      </td>
      <td className="px-3 py-3 text-[var(--muted)]">{formatDate(activity.date)}</td>
      <td className="px-3 py-3 text-[var(--muted)]">{getActivityPerson(activity, store)}</td>
      <td className="px-3 py-3 text-right font-semibold">{getActivityAmount(activity)}</td>
      <td className="px-3 py-3">
        <span className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
          {getActivityStatusLabel(activity)}
        </span>
      </td>
    </tr>
  );
}

function PropertiesCard({ properties }: { properties: PropertySummary[] }) {
  return (
    <section className="min-w-0 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Mes immeubles</h2>
        <Link className="text-sm font-semibold text-[color:var(--accent)] hover:underline" href="/immeubles">
          Voir tous ›
        </Link>
      </div>

      <div className="mt-5 divide-y divide-[var(--border)]">
        {properties.length === 0 ? (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">Aucun immeuble à afficher.</p>
        ) : (
          properties.map((property) => <PropertySummaryRow key={property.id} property={property} />)
        )}
      </div>
    </section>
  );
}

function PropertySummaryRow({ property }: { property: PropertySummary }) {
  const progressBackground = `conic-gradient(var(--green) 0 ${property.occupancyRate}%, var(--surface-3) ${property.occupancyRate}% 100%)`;

  return (
    <Link className="grid grid-cols-[56px_minmax(0,1fr)_auto_auto] items-center gap-3 py-3 transition hover:text-[color:var(--accent)]" href={property.href}>
      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-bold text-[color:var(--accent)]">
        {property.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-[var(--foreground)]">{property.name}</span>
        <span className="block text-sm text-[var(--muted)]">{property.unitCount} logement{property.unitCount > 1 ? "s" : ""}</span>
      </span>
      <span className="hidden text-right sm:block">
        <span className="block font-bold text-[var(--foreground)]">{currency.format(property.received)}</span>
        <span className="block text-xs text-[var(--muted)]">Revenus du mois</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="relative hidden h-12 w-12 rounded-full sm:block" style={{ background: progressBackground }}>
          <span className="absolute inset-1.5 flex items-center justify-center rounded-full bg-[var(--surface)] text-[10px] font-bold">{property.occupancyRate}%</span>
        </span>
        <span className="text-xl text-[var(--muted)]">›</span>
      </span>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-20 rounded-[18px] border border-[var(--border)] bg-[var(--surface)]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-40 rounded-[18px] border border-[var(--border)] bg-[var(--surface)]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
        <div className="h-[335px] rounded-[18px] border border-[var(--border)] bg-[var(--surface)]" />
        <div className="h-[335px] rounded-[18px] border border-[var(--border)] bg-[var(--surface)]" />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function buildDashboardModel(store: LocalStore, today: string, selectedMonth: string, selectedPropertyId: string, chartRange: ChartRange): DashboardModel {
  const scopedStore = getScopedStore(store, selectedPropertyId);
  const ledger = buildRentLedger(store, today);
  const scopedRows = ledger.rows.filter((row) => isInScope(row.propertyId, selectedPropertyId));
  const scopedTransactions = ledger.transactions.filter((transaction) => isInScope(transaction.propertyId, selectedPropertyId));
  const currentRows = scopedRows.filter((row) => row.dueDate.slice(0, 7) === selectedMonth);
  const previousMonth = addMonthsToMonth(selectedMonth, -1);
  const receivedThisMonth = sumTransactionsByMonth(scopedTransactions, selectedMonth);
  const receivedPreviousMonth = sumTransactionsByMonth(scopedTransactions, previousMonth);
  const receivedTrend = receivedPreviousMonth > 0 ? ((receivedThisMonth - receivedPreviousMonth) / receivedPreviousMonth) * 100 : null;
  const openMaintenance = scopedStore.maintenanceTickets.filter((ticket) => ticket.status !== "resolved");
  const urgentMaintenance = openMaintenance.filter((ticket) => ticket.priority === "urgent" || ticket.priority === "high");
  const occupancy = getOccupancyMetrics(scopedStore, scopedRows, today);

  return {
    actions: buildPriorityActions(scopedStore, scopedRows, getNotificationItems(scopedStore), today),
    chartMonths: buildChartMonths(scopedRows, scopedTransactions, selectedMonth, chartRange),
    kpis: {
      occupiedUnits: occupancy.occupied,
      occupancyRate: occupancy.rate,
      openMaintenanceCount: openMaintenance.length,
      overdueRentCount: scopedRows.filter((row) => row.balance > 0 && row.dueDate < today).length,
      remainingBalance: currentRows.reduce((sum, row) => sum + Math.max(0, row.balance), 0),
      receivedThisMonth,
      receivedTrend,
      totalUnits: scopedStore.units.length,
      urgentMaintenanceCount: urgentMaintenance.length,
    },
    month: selectedMonth,
    monthLabel: formatMonthLong(selectedMonth),
    previousMonthLabel: formatMonthLong(previousMonth),
    propertySummaries: buildPropertySummaries(store, ledger.rows, ledger.transactions, selectedMonth, selectedPropertyId),
    recentActivities: getRecentActivities(scopedStore, 5),
  };
}

function getScopedStore(store: LocalStore, selectedPropertyId: string): LocalStore {
  if (selectedPropertyId === "all") {
    return store;
  }

  const unitIds = new Set(store.units.filter((unit) => unit.propertyId === selectedPropertyId).map((unit) => unit.id));
  const tenantIds = new Set(store.leases.filter((lease) => lease.propertyId === selectedPropertyId).map((lease) => lease.tenantId));

  return {
    ...store,
    activities: store.activities.filter((activity) => activity.propertyId === selectedPropertyId || (activity.unitId ? unitIds.has(activity.unitId) : false)),
    documents: store.documents.filter((document) => document.propertyId === selectedPropertyId),
    leases: store.leases.filter((lease) => lease.propertyId === selectedPropertyId),
    maintenanceTickets: store.maintenanceTickets.filter((ticket) => ticket.propertyId === selectedPropertyId),
    notes: store.notes.filter((note) => note.propertyId === selectedPropertyId),
    paymentAllocations: store.paymentAllocations,
    paymentTransactions: store.paymentTransactions.filter((transaction) => transaction.propertyId === selectedPropertyId),
    payments: store.payments.filter((payment) => payment.propertyId === selectedPropertyId),
    properties: store.properties.filter((property) => property.id === selectedPropertyId),
    rentCharges: store.rentCharges.filter((charge) => charge.propertyId === selectedPropertyId),
    tasks: store.tasks.filter((task) => !task.propertyId || task.propertyId === selectedPropertyId),
    tenants: store.tenants.filter((tenant) => tenantIds.has(tenant.id)),
    units: store.units.filter((unit) => unit.propertyId === selectedPropertyId),
  };
}

function buildChartMonths(rows: RentChargeRow[], transactions: PaymentTransaction[], selectedMonth: string, range: ChartRange): DashboardMonth[] {
  return getMonthRange(selectedMonth, range).map((month) => ({
    expected: rows.filter((row) => row.dueDate.slice(0, 7) === month).reduce((sum, row) => sum + row.amountDue, 0),
    key: month,
    label: formatMonthShort(month),
    received: sumTransactionsByMonth(transactions, month),
  }));
}

function buildPropertySummaries(store: LocalStore, rows: RentChargeRow[], transactions: PaymentTransaction[], selectedMonth: string, selectedPropertyId: string): PropertySummary[] {
  const properties = selectedPropertyId === "all" ? store.properties : store.properties.filter((property) => property.id === selectedPropertyId);

  return properties.slice(0, 4).map((property) => {
    const units = store.units.filter((unit) => unit.propertyId === property.id);
    const activeUnitIds = new Set(store.leases.filter((lease) => lease.propertyId === property.id && isLeaseCurrent(lease)).map((lease) => lease.unitId));
    return {
      href: `/immeubles/${property.id}`,
      id: property.id,
      name: property.name,
      occupancyRate: units.length > 0 ? Math.round((activeUnitIds.size / units.length) * 100) : 0,
      received: transactions.filter((transaction) => transaction.propertyId === property.id && transaction.receivedAt.slice(0, 7) === selectedMonth).reduce((sum, transaction) => sum + transaction.amountReceived, 0),
      unitCount: units.length,
    };
  });
}

function getOccupancyMetrics(store: LocalStore, rows: RentChargeRow[], today: string) {
  const activeLeaseUnitIds = new Set(store.leases.filter((lease) => isLeaseCurrent(lease, today)).map((lease) => lease.unitId));
  const attentionUnitIds = new Set(rows.filter((row) => row.balance > 0 && row.dueDate < today).map((row) => row.unitId));
  for (const ticket of store.maintenanceTickets.filter((ticket) => ticket.status !== "resolved" && (ticket.priority === "urgent" || ticket.priority === "high"))) {
    attentionUnitIds.add(ticket.unitId);
  }

  const occupied = store.units.filter((unit) => activeLeaseUnitIds.has(unit.id)).length;
  const attention = store.units.filter((unit) => activeLeaseUnitIds.has(unit.id) && attentionUnitIds.has(unit.id)).length;
  const total = store.units.length;

  return {
    attention,
    occupied,
    rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
    total,
  };
}

function buildPriorityActions(store: LocalStore, rows: RentChargeRow[], notifications: NotificationItem[], today: string): PriorityAction[] {
  const notificationActions = notifications
    .filter((notification) => notification.priority === "urgent" || notification.priority === "attention")
    .map((notification) => ({
      actionLabel: getNotificationActionLabel(notification),
      amountOrDate: getNotificationAmountOrDate(notification),
      context: [notification.property, notification.unit, notification.tenant].filter(Boolean).join(" · "),
      dueDate: notification.relatedDeadline ?? notification.sortDate.slice(0, 10),
      href: notification.href,
      id: notification.id,
      priority: notification.priority,
      title: normalizeNotificationTitle(notification.title),
    }));

  const overdueTasks = store.tasks
    .filter((task) => !task.completed && task.dueDate <= today)
    .map((task) => ({
      actionLabel: "Terminer",
      amountOrDate: formatDateShort(task.dueDate),
      context: getTaskContext(task, store),
      dueDate: task.dueDate,
      href: "/taches",
      id: `task-${task.id}`,
      priority: "attention" as const,
      title: "Tâche en retard",
    }));

  const anomalousRows = rows
    .filter((row) => row.hasAnomaly)
    .map((row) => ({
      actionLabel: "Vérifier",
      amountOrDate: currency.format(row.balance),
      context: `${getPropertyName(row.propertyId, store)} · ${getUnitLabel(row.unitId, store)}`,
      dueDate: row.dueDate,
      href: "/paiements",
      id: `charge-anomaly-${row.id}`,
      priority: "attention" as const,
      title: "Loyer à vérifier",
    }));

  return dedupePriorityActions([...notificationActions, ...overdueTasks, ...anomalousRows])
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
}

function dedupePriorityActions(actions: PriorityAction[]) {
  const actionMap = new Map<string, PriorityAction>();
  for (const action of actions) {
    const key = `${action.title}-${action.context}`;
    const existing = actionMap.get(key);
    if (!existing || priorityRank(action.priority) < priorityRank(existing.priority) || action.dueDate < existing.dueDate) {
      actionMap.set(key, action);
    }
  }
  return [...actionMap.values()];
}

function getNotificationActionLabel(notification: NotificationItem) {
  const title = notification.title.toLowerCase();
  if (title.includes("paiement")) return title.includes("partiel") ? "Compléter" : "Encaisser";
  if (title.includes("copie") || title.includes("document")) return "Ajouter";
  if (title.includes("bail")) return "Voir le bail";
  if (title.includes("entretien")) return "Traiter";
  return "Voir";
}

function getNotificationAmountOrDate(notification: NotificationItem) {
  if (notification.title.toLowerCase().includes("paiement")) {
    return notification.urgencyReason.match(/d[ds.,]*s?$/)?.[0] ?? formatDateShort(notification.relatedDeadline ?? notification.sortDate);
  }
  return formatDateShort(notification.relatedDeadline ?? notification.sortDate);
}

function normalizeNotificationTitle(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("paiement")) return "Loyer en retard";
  if (normalized.includes("copie")) return "Document manquant";
  if (normalized.includes("bail")) return "Bail expire bientôt";
  return title;
}

function getTaskContext(task: { propertyId?: string; unitId?: string; tenantId?: string | null }, store: LocalStore) {
  const property = task.propertyId ? getPropertyName(task.propertyId, store) : "Portefeuille";
  const unit = task.unitId ? getUnitLabel(task.unitId, store) : null;
  const tenant = task.tenantId ? getTenantName(task.tenantId, store) : null;
  return [property, unit, tenant].filter(Boolean).join(" · ");
}

function getTenantName(tenantId: string | null | undefined, store: LocalStore) {
  const tenant = tenantId ? store.tenants.find((candidate) => candidate.id === tenantId) : null;
  return tenant ? tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim() : null;
}

function getActivityContext(activity: UnitActivity, store: LocalStore) {
  const propertyId = activity.propertyId || (activity.unitId ? store.units.find((unit) => unit.id === activity.unitId)?.propertyId : "");
  const property = propertyId ? getPropertyName(propertyId, store) : "Portefeuille";
  const unit = activity.unitId ? getUnitLabel(activity.unitId, store) : null;
  return [property, unit].filter(Boolean).join(" · ");
}

function getActivityPerson(activity: UnitActivity, store: LocalStore) {
  return getTenantName(activity.tenantId, store) ?? "—";
}

function getActivityAmount(activity: UnitActivity) {
  if (activity.type !== "paiement") return "—";
  const match = activity.description.match(/d[ds.,]*s?$/);
  return match?.[0] ?? "—";
}

function getActivityStatusLabel(activity: UnitActivity) {
  const labels: Record<UnitActivity["type"], string> = {
    bail: "Actif",
    document: "Enregistré",
    entretien: "Ouverte",
    immeuble: "Actif",
    locataire: "Actif",
    note: "Note",
    paiement: "Reçu",
    tache: "Terminée",
  };
  return labels[activity.type];
}

function getActivityHref(activity: UnitActivity) {
  if (activity.type === "paiement") return "/paiements";
  if (activity.type === "bail") return "/baux";
  if (activity.type === "document") return "/documents";
  if (activity.type === "entretien") return "/entretien";
  if (activity.type === "tache") return "/taches";
  if (activity.tenantId) return  `/locataires?tenant=${activity.tenantId}`;
  if (activity.propertyId) return  `/immeubles/${activity.propertyId}`;
  return "/activites";
}

function getToneClasses(tone: DashboardTone) {
  const classes = {
    blue: {
      card: "border-[color:var(--accent)]/18",
      helper: "text-[color:var(--green)]",
      icon: "bg-[color:var(--accent)]/18 text-[color:var(--accent)]",
      progress: "bg-[color:var(--accent)]",
    },
    green: {
      card: "border-[color:var(--green)]/18",
      helper: "text-[color:var(--green)]",
      icon: "bg-[color:var(--green)]/16 text-[color:var(--green)]",
      progress: "bg-[color:var(--green)]",
    },
    orange: {
      card: "border-[color:var(--yellow)]/20",
      helper: "text-[color:var(--yellow)]",
      icon: "bg-[color:var(--yellow)]/16 text-[color:var(--yellow)]",
      progress: "bg-[color:var(--yellow)]",
    },
    purple: {
      card: "border-[#8b5cf6]/22",
      helper: "text-[var(--muted)]",
      icon: "bg-[#8b5cf6]/18 text-[#a78bfa]",
      progress: "bg-[#8b5cf6]",
    },
    red: {
      card: "border-[color:var(--red)]/30 bg-[color:var(--red)]/5",
      helper: "text-[color:var(--red)]",
      icon: "bg-[color:var(--red)]/16 text-[color:var(--red)]",
      progress: "bg-[color:var(--red)]",
    },
  };
  return classes[tone];
}

function getActivityIconClass(type: UnitActivity["type"]) {
  if (type === "paiement") return "bg-[color:var(--green)]/14 text-[color:var(--green)]";
  if (type === "bail") return "bg-[#8b5cf6]/18 text-[#a78bfa]";
  if (type === "entretien") return "bg-[color:var(--yellow)]/14 text-[color:var(--yellow)]";
  if (type === "document") return "bg-[color:var(--accent)]/14 text-[color:var(--accent)]";
  return "bg-[var(--surface-2)] text-[var(--muted)]";
}

function getActionIcon(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("loyer") || normalized.includes("paiement")) return "$";
  if (normalized.includes("bail")) return "□";
  if (normalized.includes("document")) return "▱";
  if (normalized.includes("entretien")) return "⌁";
  return "✓";
}

function formatTrend(trend: number | null, previousMonthLabel: string) {
  if (trend === null) return `Comparaison indisponible`;
  const sign = trend >= 0 ? "+" : "";
  return `${sign}${trend.toFixed(1).replace(".", ",")} % vs ${previousMonthLabel.toLowerCase()}`;
}

function sumTransactionsByMonth(transactions: PaymentTransaction[], month: string) {
  return transactions.filter((transaction) => transaction.receivedAt.slice(0, 7) === month).reduce((sum, transaction) => sum + transaction.amountReceived, 0);
}

function isInScope(propertyId: string, selectedPropertyId: string) {
  return selectedPropertyId === "all" || propertyId === selectedPropertyId;
}

function priorityRank(priority: PriorityAction["priority"]) {
  return priority === "urgent" ? 0 : priority === "attention" ? 1 : 2;
}

function getMonthRange(currentMonth: string, range: ChartRange) {
  return Array.from({ length: range }, (_, index) => addMonthsToMonth(currentMonth, index - range + 1));
}

function addMonthsToMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextDate = new Date(year, month - 1 + offset, 1);
  return `${nextDate.getFullYear()}-${`${nextDate.getMonth() + 1}`.padStart(2, "0")}`;
}

function formatMonthShort(monthKey: string) {
  const month = Number(monthKey.slice(5, 7));
  return shortMonthNames[month - 1] ?? monthKey;
}

function formatMonthLong(monthKey: string) {
  const month = Number(monthKey.slice(5, 7));
  return `${monthNames[month - 1] ?? monthKey} ${monthKey.slice(0, 4)}`;
}

function formatDate(date: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-CA", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

function formatDateShort(date: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

function formatCompactAmount(amount: number) {
  if (amount === 0) return "0";
  if (amount >= 1000) return `${Math.round(amount / 1000)}K`;
  return `${amount}`;
}

function getBarHeight(amount: number, maxAmount: number) {
  if (amount <= 0) return 2;
  return Math.max(6, Math.round((amount / maxAmount) * 100));
}

function getTodayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
}

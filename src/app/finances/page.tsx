"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { loadPortfolioSnapshot, type PortfolioSnapshot } from "@/lib/data/portfolioSnapshotService";
import {
  getFinanceSummary,
  getOccupancyRate,
  getRevenueChartData,
  getScopedFinancePayments,
} from "@/lib/financeCalculations";
import { currency, getPropertyDashboards, getPropertyName, getTenantName, getUnitLabel } from "@/lib/mockData";
import { exportFinancialReport } from "@/lib/reportExports";
import type { LocalStore, PaymentRecord, PropertyDashboard } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type PeriodFilter = "mois" | "12mois";

export default function FinancesPage() {
  const { store } = useLocalStore();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("portfolio");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("12mois");
  const snapshotStore = snapshot ?? store;
  const properties = useMemo(() => getPropertyDashboards(snapshotStore), [snapshotStore]);
  const selectedProperty = properties.find((property) => property.id === propertyFilter) ?? null;
  const scopedPayments = useMemo(() => getScopedFinancePayments(snapshotStore, { period: periodFilter, propertyId: propertyFilter }), [periodFilter, propertyFilter, snapshotStore]);
  const scopedProperties = propertyFilter === "portfolio" ? properties : selectedProperty ? [selectedProperty] : [];
  const summary = getFinanceSummary(snapshotStore, { period: periodFilter, propertyId: propertyFilter }, scopedProperties.flatMap((property) => property.units));
  const chartData = getRevenueChartData(snapshotStore, { period: periodFilter, propertyId: propertyFilter });
  const risks = getUpcomingRisks(snapshotStore, scopedProperties, scopedPayments);

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
        console.error("Impossible de charger les finances depuis le snapshot.", error);
        if (active) {
          setSnapshotError("Impossible de synchroniser les finances. Les données locales sont affichées.");
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

  return (
    <RouteShell
      title="Finances"
      description="Performance financière du portefeuille, revenus, retards, occupation et risques à surveiller."
    >
      <section className="grid gap-5">
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => exportFinancialReport(snapshotStore, { period: periodFilter, propertyId: propertyFilter })} type="button">
            Exporter le rapport financier
          </button>
        </div>

        {snapshotLoading ? <p className="text-sm text-[var(--muted)]">Synchronisation des finances...</p> : null}
        {snapshotError ? <p className="text-sm font-semibold text-[color:var(--amber)]">{snapshotError}</p> : null}

        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                propertyFilter === "portfolio"
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setPropertyFilter("portfolio")}
              type="button"
            >
              Portefeuille
            </button>
            {properties.map((property) => (
              <button
                key={property.id}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                  propertyFilter === property.id
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setPropertyFilter(property.id)}
                type="button"
              >
                {property.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                periodFilter === "mois"
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setPeriodFilter("mois")}
              type="button"
            >
              Mois courant
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                periodFilter === "12mois"
                  ? "bg-[color:var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setPeriodFilter("12mois")}
              type="button"
            >
              12 derniers mois
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard label="Revenus mensuels attendus" value={currency.format(summary.expected)} />
          <KpiCard label="Revenus reçus" value={currency.format(summary.received)} />
          <KpiCard label="Solde impayé" value={currency.format(summary.balanceDue)} tone={summary.balanceDue > 0 ? "issue" : "ok"} />
          <KpiCard label="Taux d'occupation" value={`${summary.occupancyRate} %`} />
          <KpiCard label="Paiements en retard" value={summary.latePayments.toString()} tone={summary.latePayments > 0 ? "issue" : "ok"} />
          <KpiCard label="Flux de trésorerie reçu" value={currency.format(summary.netCashflow)} tone={summary.netCashflow >= 0 ? "ok" : "issue"} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <RevenueChart data={chartData} />
          <QuickActions />
        </div>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--muted)]">Immeubles</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Ventilation par immeuble</h2>
            </div>
          </div>
          <div className="grid gap-3">
            {scopedProperties.map((property) => (
              <PropertyBreakdown key={property.id} property={property} store={snapshotStore} />
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="mb-4">
            <p className="text-sm font-medium text-[var(--muted)]">Vigilance</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Risques à venir</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {risks.map((risk) => (
              <Link
                key={risk.id}
                href={risk.href}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)]"
              >
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${risk.tone}`}>
                  {risk.type}
                </span>
                <h3 className="mt-3 font-semibold text-[var(--foreground)]">{risk.title}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{risk.detail}</p>
              </Link>
            ))}
            {risks.length === 0 ? (
              <p className="rounded-lg border border-[color:var(--green)]/30 bg-[color:var(--green)]/10 p-4 text-sm font-medium text-[color:var(--green)]">
                Aucun risque financier majeur détecté pour cette portée.
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </RouteShell>
  );
}

function KpiCard({ label, tone = "neutral", value }: { label: string; tone?: "neutral" | "ok" | "issue"; value: string }) {
  const toneClass =
    tone === "ok"
      ? "text-[color:var(--green)]"
      : tone === "issue"
        ? "text-[color:var(--red)]"
        : "text-[var(--foreground)]";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className={`mt-3 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function RevenueChart({ data }: { data: { month: string; expected: number; received: number }[] }) {
  const maxValue = Math.max(1, ...data.map((point) => Math.max(point.expected, point.received)));

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--muted)]">Revenus</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Reçus vs attendus</h2>
        </div>
        <div className="flex gap-3 text-xs font-semibold text-[var(--muted)]">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[color:var(--accent)]" /> Attendus</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[color:var(--green)]" /> Reçus</span>
        </div>
      </div>

      <div className="grid h-[300px] grid-cols-12 items-end gap-3 border-b border-l border-[var(--border)] px-3 pb-3">
        {data.map((point) => (
          <div key={point.month} className="flex h-full min-w-0 flex-col justify-end gap-2">
            <div className="flex flex-1 items-end gap-1.5">
              <div
                className="w-full rounded-t bg-[color:var(--accent)]/75"
                style={{ height: `${Math.max(4, (point.expected / maxValue) * 100)}%` }}
                title={`${point.month} attendus: ${currency.format(point.expected)}`}
              />
              <div
                className="w-full rounded-t bg-[color:var(--green)]/80"
                style={{ height: `${Math.max(4, (point.received / maxValue) * 100)}%` }}
                title={`${point.month} reçus: ${currency.format(point.received)}`}
              />
            </div>
            <span className="truncate text-center text-[10px] font-semibold text-[var(--muted)]">{point.month.slice(5)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActions() {
  return (
    <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <p className="text-sm font-medium text-[var(--muted)]">Actions rapides</p>
      <h2 className="mt-1 text-xl font-semibold text-[var(--foreground)]">Suivi financier</h2>
      <div className="mt-5 grid gap-3">
        <Link className="btn-primary text-center" href="/paiements">Voir les paiements</Link>
        <Link className="btn-secondary text-center" href="/baux">Voir les baux</Link>
        <Link className="btn-secondary text-center" href="/entretien">Voir les demandes d&apos;entretien</Link>
      </div>
    </aside>
  );
}

function PropertyBreakdown({ property, store }: { property: PropertyDashboard; store: LocalStore }) {
  const payments = getScopedFinancePayments(store, { period: "mois", propertyId: property.id });
  const monthlyIncome = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const latePayments = payments.filter((payment) => payment.status === "en retard").length;
  const openTickets = store.maintenanceTickets.filter((ticket) => ticket.propertyId === property.id && ticket.status !== "resolved");
  const maintenanceCost = openTickets.reduce((sum, ticket) => sum + getMockMaintenanceCost(ticket.priority), 0);

  return (
    <div className="grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
      <div>
        <p className="font-semibold text-[var(--foreground)]">{property.name}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{property.address}</p>
      </div>
      <BreakdownItem label="Revenu mensuel" value={currency.format(monthlyIncome)} />
      <BreakdownItem label="Occupation" value={`${getOccupancyRate(property.units, store)} %`} />
      <BreakdownItem label="Coût des demandes ouvertes" value={currency.format(maintenanceCost)} />
      <BreakdownItem label="Retards" value={latePayments.toString()} />
    </div>
  );
}

function BreakdownItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function getUpcomingRisks(store: LocalStore, properties: PropertyDashboard[], payments: PaymentRecord[]) {
  const propertyIds = new Set(properties.map((property) => property.id));
  const risks: { id: string; type: string; title: string; detail: string; href: string; tone: string }[] = [];

  for (const unit of store.units.filter((candidate) => {
    const occupancy = getUnitOccupancy(candidate, store.leases, store.tenants);
    return propertyIds.has(candidate.propertyId) && !occupancy.isOccupied;
  })) {
    risks.push({
      id: `vacant-${unit.id}`,
      type: "Vacance",
      title: `${unit.label} vacant`,
      detail: `${getPropertyName(unit.propertyId, store)} · revenu potentiel à confirmer`,
      href: `/dashboard?property=${unit.propertyId}&unit=${unit.id}&tab=resume`,
      tone: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
    });
  }

  for (const payment of payments.filter((candidate) => candidate.status === "en retard")) {
    risks.push({
      id: `late-${payment.id}`,
      type: "Retard",
      title: `Paiement en retard · ${getUnitLabel(payment.unitId, store)}`,
      detail: `${getTenantName(payment.tenantId, store)} · solde ${currency.format(payment.amountDue - payment.amountPaid)}`,
      href: `/dashboard?property=${payment.propertyId}&unit=${payment.unitId}&tab=paiements`,
      tone: "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
    });
  }

  for (const lease of store.leases.filter((candidate) => candidate.status === "active" && propertyIds.has(candidate.propertyId) && isLeaseExpiring(candidate.endDate))) {
    const unit = store.units.find((candidate) => candidate.id === lease.unitId);

    if (!unit) {
      continue;
    }

    risks.push({
      id: `lease-${lease.id}`,
      type: "Bail",
      title: `Bail à surveiller · ${unit.label}`,
      detail: `${getPropertyName(lease.propertyId, store)} · fin ${lease.endDate}`,
      href: `/dashboard?property=${lease.propertyId}&unit=${lease.unitId}&tab=bail`,
      tone: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
    });
  }

  for (const ticket of store.maintenanceTickets.filter((candidate) => propertyIds.has(candidate.propertyId) && candidate.status !== "resolved")) {
    const cost = getMockMaintenanceCost(ticket.priority);
    if (cost < 450) {
      continue;
    }

    risks.push({
      id: `maintenance-${ticket.id}`,
      type: "Demande d'entretien",
      title: ticket.title,
      detail: `${getPropertyName(ticket.propertyId, store)} · coût estimé ${currency.format(cost)}`,
      href: "/entretien",
      tone: "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
    });
  }

  return risks.slice(0, 8);
}

function getMockMaintenanceCost(priority: string) {
  const costs: Record<string, number> = {
    low: 180,
    medium: 360,
    high: 720,
    urgent: 1200,
  };

  return costs[priority] ?? 300;
}

function isLeaseExpiring(date: string) {
  const now = new Date();
  const leaseEnd = new Date(`${date}T12:00:00`);
  const days = Math.ceil((leaseEnd.getTime() - now.getTime()) / 86_400_000);
  return days >= 0 && days <= 120;
}

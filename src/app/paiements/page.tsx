"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { getTodayIsoDate } from "@/lib/data/paymentSideEffectsService";
import {
  getRentLedger,
  getRentLedgerSummary,
  recordPaymentTransaction,
  type RentChargeRow,
  type RentLedger,
} from "@/lib/data/rentLedgerService";
import { currency, getPropertyName, getUnitLabel, rentPaymentStatusLabel } from "@/lib/mockData";
import type { LocalStore, PaymentAllocation, PaymentMethod, PaymentTransaction, RentPaymentStatus } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";

type PaymentWorkspaceFilter = "attention" | "tous" | "payes" | "avenir" | "historique";

type RegisterPaymentForm = {
  chargeIds: string[];
  amountReceived: number;
  receivedAt: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
};

type ChargeSection = {
  id: string;
  title: string;
  rows: RentChargeRow[];
  collapsible?: boolean;
};

const paymentMethods: { label: string; value: PaymentMethod }[] = [
  { label: "Virement", value: "virement" },
  { label: "Interac", value: "interac" },
  { label: "Chèque", value: "cheque" },
  { label: "Espèces", value: "especes" },
  { label: "Carte", value: "carte" },
  { label: "Autre", value: "autre" },
];

const statusClasses: Record<RentPaymentStatus, string> = {
  payé: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  partiel: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  "en retard": "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  "à venir": "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
};

const monthNames = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export default function PaiementsPage() {
  const { store, setStore } = useLocalStore();
  const { data, error: snapshotError, loading: snapshotLoading, refresh, isReady, isSupabaseMode } = usePortfolioSnapshot();
  const [activeFilter, setActiveFilter] = useState<PaymentWorkspaceFilter>("attention");
  const [today, setToday] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [ledger, setLedger] = useState<RentLedger | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [modalChargeId, setModalChargeId] = useState<string | null>(null);
  const [viewingChargeId, setViewingChargeId] = useState<string | null>(null);
  const [openMenuRowId, setOpenMenuRowId] = useState<string | null>(null);
  const [expandedFuture, setExpandedFuture] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const paymentSaveInFlightRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState("");
  const displayStore = data ?? store;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const currentDate = getTodayIsoDate();
      setToday(currentDate);
      setSelectedMonth((month) => month || currentDate.slice(0, 7));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;

    if (!data && isSupabaseMode) {
      return () => {
        active = false;
      };
    }

    const timer = window.setTimeout(() => {
      if (!active) {
        return;
      }

      setLedgerLoading(true);
      getRentLedger(displayStore)
        .then((nextLedger) => {
          if (!active) {
            return;
          }

          setLedger(nextLedger);
          setErrorMessage("");
        })
        .catch((error) => {
          console.error("Impossible de charger le registre des loyers.", error);
          if (active) {
            setErrorMessage("Impossible de charger le registre des loyers.");
          }
        })
        .finally(() => {
          if (active) {
            setLedgerLoading(false);
          }
        });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [data, displayStore, isSupabaseMode]);

  const visibleLedger = isSupabaseMode && !data ? null : ledger;
  const summary = useMemo(
    () =>
      visibleLedger && selectedMonth
        ? getRentLedgerSummary(visibleLedger, selectedMonth, today || getTodayIsoDate())
        : getRentLedgerSummary({ charges: [], transactions: [], allocations: [], rows: [] }, selectedMonth || "0000-00", today || "9999-12-31"),
    [selectedMonth, today, visibleLedger],
  );
  const filterCounts = useMemo(
    () => getFilterCounts(visibleLedger?.rows ?? [], selectedMonth, today),
    [selectedMonth, today, visibleLedger],
  );
  const sections = useMemo(
    () => getChargeSections(visibleLedger?.rows ?? [], activeFilter, selectedMonth, today),
    [activeFilter, selectedMonth, today, visibleLedger],
  );
  const viewingCharge = viewingChargeId ? visibleLedger?.rows.find((row) => row.id === viewingChargeId) ?? null : null;
  const modalOpen = modalChargeId !== null;
  const loading = snapshotLoading || ledgerLoading || (!isReady && isSupabaseMode) || !selectedMonth || !today;

  async function reloadLedger(nextStore: LocalStore = displayStore) {
    const nextLedger = await getRentLedger(nextStore);
    setLedger(nextLedger);
  }

  async function handleRegisterPayment(form: RegisterPaymentForm) {
    if (paymentSaveInFlightRef.current) {
      return;
    }

    paymentSaveInFlightRef.current = true;
    setIsSaving(true);
    setErrorMessage("");

    try {
      const nextStore = await recordPaymentTransaction(displayStore, form);

      setStore(nextStore);
      await refresh();
      await reloadLedger(nextStore);
      setModalChargeId(null);
    } catch (error) {
      console.error("Impossible d'enregistrer le paiement.", error);
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'enregistrer le paiement.");
    } finally {
      paymentSaveInFlightRef.current = false;
      setIsSaving(false);
    }
  }

  function openRegisterModal(row?: RentChargeRow) {
    setOpenMenuRowId(null);
    setErrorMessage("");

    if (row && row.balance <= 0) {
      setViewingChargeId(row.id);
      return;
    }

    setModalChargeId(row?.id ?? "");
  }

  function openChargeDetails(row: RentChargeRow) {
    setOpenMenuRowId(null);
    setViewingChargeId(row.id);
  }

  function changeSelectedMonth(delta: number) {
    setSelectedMonth((month) => addMonthsToMonth(month || getTodayIsoDate().slice(0, 7), delta));
    setExpandedFuture(false);
  }

  return (
    <RouteShell
      title="Paiements"
      description="Suivi des loyers exigibles, encaissements et retards."
      action={
        <button className="btn-primary w-full justify-center whitespace-nowrap sm:w-auto" onClick={() => openRegisterModal()} type="button">
          + Enregistrer un paiement
        </button>
      }
    >
      <section className="grid gap-5 overflow-hidden">
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <MonthSelector
            currentMonth={today ? today.slice(0, 7) : ""}
            selectedMonth={selectedMonth}
            onCurrentMonth={() => {
              setSelectedMonth(today.slice(0, 7));
              setExpandedFuture(false);
            }}
            onNext={() => changeSelectedMonth(1)}
            onPrevious={() => changeSelectedMonth(-1)}
          />
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Les charges affichées proviennent des baux. Les encaissements sont comptabilisés selon leur vraie date de réception.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="À encaisser ce mois" value={currency.format(summary.dueThisMonth)} />
          <Metric label="Reçu ce mois" value={currency.format(summary.receivedThisMonth)} tone="ok" />
          <Metric label="En retard" value={currency.format(summary.overdueBalance)} tone={summary.overdueBalance > 0 ? "issue" : "ok"} />
          <Metric label="Solde restant du mois" value={currency.format(summary.remainingThisMonth)} tone={summary.remainingThisMonth > 0 ? "attention" : "ok"} />
        </div>

        <p className="text-xs font-medium text-[var(--muted)]">
          Solde total à recevoir, toutes périodes confondues: <span className="text-[var(--foreground)]">{currency.format(summary.totalReceivable)}</span>
        </p>

        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {getFilterDefinitions(filterCounts).map((filter) => {
            const active = activeFilter === filter.value;

            return (
              <button
                key={filter.value}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[color:var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => {
                  setActiveFilter(filter.value);
                  setExpandedFuture(false);
                }}
                type="button"
              >
                <AppIcon name={filter.icon} size={16} />
                <span>{filter.label}</span>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          {loading ? (
            <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)]">
              Synchronisation des loyers et paiements...
            </div>
          ) : null}
          {snapshotError ? (
            <div className="mb-4 rounded-lg border border-[color:var(--red)]/35 bg-[color:var(--red)]/10 px-4 py-3 text-sm font-semibold text-[color:var(--red)]">
              Impossible de charger les données du portefeuille.
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mb-4 rounded-lg border border-[color:var(--red)]/35 bg-[color:var(--red)]/10 px-4 py-3 text-sm font-semibold text-[color:var(--red)]">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-6">
            {sections.map((section) => (
              <ChargeSectionView
                key={section.id}
                expanded={expandedFuture || !section.collapsible}
                onExpand={() => setExpandedFuture(true)}
                onOpenDetails={openChargeDetails}
                onOpenMenu={setOpenMenuRowId}
                onRegister={openRegisterModal}
                openMenuRowId={openMenuRowId}
                section={section}
                store={displayStore}
              />
            ))}
            {!loading && sections.length === 0 ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                Aucun loyer ne correspond au filtre sélectionné.
              </div>
            ) : null}
          </div>
        </div>

        {modalOpen && visibleLedger ? (
          <RegisterPaymentModal
            initialChargeId={modalChargeId || undefined}
            rows={visibleLedger.rows}
            store={displayStore}
            isSaving={isSaving}
            onCancel={() => setModalChargeId(null)}
            onSave={handleRegisterPayment}
          />
        ) : null}
        {viewingCharge && visibleLedger ? (
          <ChargeDetailsModal
            ledger={visibleLedger}
            row={viewingCharge}
            store={displayStore}
            onCancel={() => setViewingChargeId(null)}
          />
        ) : null}
      </section>
    </RouteShell>
  );
}

function MonthSelector({
  currentMonth,
  selectedMonth,
  onCurrentMonth,
  onNext,
  onPrevious,
}: {
  currentMonth: string;
  selectedMonth: string;
  onCurrentMonth: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] hover:border-[color:var(--accent)]/60"
        onClick={onPrevious}
        type="button"
      >
        ‹
      </button>
      <div className="min-w-[180px] rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-center text-sm font-semibold text-[var(--foreground)]">
        {selectedMonth ? formatMonthLabel(selectedMonth) : "Chargement..."}
      </div>
      <button
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] hover:border-[color:var(--accent)]/60"
        onClick={onNext}
        type="button"
      >
        ›
      </button>
      <button
        className="rounded-md px-3 py-2 text-sm font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10 disabled:text-[var(--muted)]"
        disabled={!currentMonth || selectedMonth === currentMonth}
        onClick={onCurrentMonth}
        type="button"
      >
        Ce mois
      </button>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ok" | "attention" | "issue" }) {
  const toneClass =
    tone === "ok"
      ? "text-[color:var(--green)]"
      : tone === "attention"
        ? "text-[color:var(--yellow)]"
        : tone === "issue"
          ? "text-[color:var(--red)]"
          : "text-[var(--foreground)]";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ChargeSectionView({
  expanded,
  onExpand,
  onOpenDetails,
  onOpenMenu,
  onRegister,
  openMenuRowId,
  section,
  store,
}: {
  expanded: boolean;
  onExpand: () => void;
  onOpenDetails: (row: RentChargeRow) => void;
  onOpenMenu: (rowId: string | null) => void;
  onRegister: (row?: RentChargeRow) => void;
  openMenuRowId: string | null;
  section: ChargeSection;
  store: LocalStore;
}) {
  const visibleRows = section.collapsible && !expanded ? section.rows.slice(0, 3) : section.rows;
  const hiddenCount = Math.max(0, section.rows.length - visibleRows.length);

  if (section.rows.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          {section.title} · {section.rows.length}
        </h2>
        {section.collapsible && hiddenCount > 0 ? (
          <button className="text-sm font-semibold text-[color:var(--accent)] hover:text-[var(--foreground)]" onClick={onExpand} type="button">
            Afficher les {hiddenCount} échéances futures
          </button>
        ) : null}
      </div>

      <div className="hidden overflow-visible rounded-lg border border-[var(--border)] lg:block">
        <div className="grid grid-cols-[minmax(220px,2fr)_0.7fr_0.85fr_0.85fr_0.85fr_0.9fr_0.85fr_1fr] gap-3 bg-[var(--surface-2)] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)]">
          <span>Locataire / logement</span>
          <span>Période</span>
          <span className="text-right">Montant dû</span>
          <span className="text-right">Reçu</span>
          <span className="text-right">Solde</span>
          <span>Échéance</span>
          <span>Statut</span>
          <span className="text-right">Action</span>
        </div>
        {visibleRows.map((row) => (
          <PaymentTableRow
            key={row.id}
            openMenuRowId={openMenuRowId}
            row={row}
            store={store}
            onOpenDetails={onOpenDetails}
            onOpenMenu={onOpenMenu}
            onRegister={onRegister}
          />
        ))}
      </div>

      <div className="grid gap-3 lg:hidden">
        {visibleRows.map((row) => (
          <PaymentCard
            key={row.id}
            row={row}
            store={store}
            onOpenDetails={onOpenDetails}
            onRegister={onRegister}
          />
        ))}
      </div>
    </section>
  );
}

function PaymentTableRow({
  onOpenDetails,
  onOpenMenu,
  onRegister,
  openMenuRowId,
  row,
  store,
}: {
  onOpenDetails: (row: RentChargeRow) => void;
  onOpenMenu: (rowId: string | null) => void;
  onRegister: (row?: RentChargeRow) => void;
  openMenuRowId: string | null;
  row: RentChargeRow;
  store: LocalStore;
}) {
  const action = getActionLabel(row);

  return (
    <div className={`grid grid-cols-[minmax(220px,2fr)_0.7fr_0.85fr_0.85fr_0.85fr_0.9fr_0.85fr_1fr] gap-3 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--foreground)] ${row.hasAnomaly ? "bg-[color:var(--red)]/5" : ""}`}>
      <TenantCell row={row} store={store} />
      <span className="self-center font-medium">{row.periodMonth}</span>
      <span className="self-center text-right font-semibold tabular-nums">{currency.format(row.amountDue)}</span>
      <span className="self-center text-right tabular-nums text-[var(--muted)]">{currency.format(row.amountAllocated)}</span>
      <span className={`self-center text-right font-semibold tabular-nums ${row.balance > 0 ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
        {currency.format(row.balance)}
      </span>
      <span className="self-center text-[var(--muted)]">{formatShortDate(row.dueDate)}</span>
      <span className="self-center">
        <StatusBadge row={row} />
      </span>
      <span className="relative flex items-center justify-end gap-2">
        <button
          className={row.balance > 0 ? "btn-primary px-3 py-1.5 text-xs" : "btn-secondary px-3 py-1.5 text-xs"}
          onClick={() => (row.balance > 0 ? onRegister(row) : onOpenDetails(row))}
          type="button"
        >
          {action}
        </button>
        <button
          aria-label={`Plus d'actions pour ${getTenantDisplayName(row, store)}`}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={() => onOpenMenu(openMenuRowId === row.id ? null : row.id)}
          type="button"
        >
          …
        </button>
        {openMenuRowId === row.id ? (
          <div className="absolute right-0 top-9 z-20 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-left shadow-lg shadow-black/20">
            <MenuButton label="Corriger une transaction" onClick={() => onOpenDetails(row)} />
            <MenuButton label="Annuler une transaction" onClick={() => onOpenDetails(row)} />
            <MenuButton label="Consulter les détails" onClick={() => onOpenDetails(row)} />
          </div>
        ) : null}
      </span>
    </div>
  );
}

function PaymentCard({
  onOpenDetails,
  onRegister,
  row,
  store,
}: {
  onOpenDetails: (row: RentChargeRow) => void;
  onRegister: (row?: RentChargeRow) => void;
  row: RentChargeRow;
  store: LocalStore;
}) {
  return (
    <article className={`rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 ${row.hasAnomaly ? "border-[color:var(--red)]/45 bg-[color:var(--red)]/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <TenantCell row={row} store={store} />
        <StatusBadge row={row} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <MobileAmount label="Dû" value={currency.format(row.amountDue)} />
        <MobileAmount label="Reçu" value={currency.format(row.amountAllocated)} />
        <MobileAmount label="Solde" value={currency.format(row.balance)} emphasized={row.balance > 0} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {row.periodMonth} · échéance {formatShortDate(row.dueDate)}
        </p>
        <button
          className={row.balance > 0 ? "btn-primary px-3 py-1.5 text-xs" : "btn-secondary px-3 py-1.5 text-xs"}
          onClick={() => (row.balance > 0 ? onRegister(row) : onOpenDetails(row))}
          type="button"
        >
          {getActionLabel(row)}
        </button>
      </div>
    </article>
  );
}

function TenantCell({ row, store }: { row: RentChargeRow; store: LocalStore }) {
  return (
    <span className="min-w-0 self-center">
      <span className={`block truncate font-semibold ${row.hasAnomaly ? "text-[color:var(--red)]" : "text-[var(--foreground)]"}`}>
        {getTenantDisplayName(row, store)}
      </span>
      <span className="mt-1 block truncate text-xs text-[var(--muted)]">
        {getPropertyName(row.propertyId, store)} · {getUnitLabel(row.unitId, store)}
      </span>
      {row.lastPaymentAt ? (
        <span className="mt-1 block truncate text-xs text-[var(--muted)]">Payé le {formatShortDate(row.lastPaymentAt)}</span>
      ) : null}
      {row.anomalyReason ? <span className="mt-1 block text-xs font-semibold text-[color:var(--red)]">{row.anomalyReason}</span> : null}
    </span>
  );
}

function MobileAmount({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className={`mt-1 font-semibold tabular-nums ${emphasized ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ row }: { row: RentChargeRow }) {
  if (row.hasAnomaly) {
    return (
      <span className="inline-flex rounded-full border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-2.5 py-1 text-xs font-semibold text-[color:var(--red)]">
        À corriger
      </span>
    );
  }

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[row.status]}`}>
      {rentPaymentStatusLabel[row.status]}
    </span>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function RegisterPaymentModal({
  initialChargeId,
  rows,
  store,
  isSaving,
  onCancel,
  onSave,
}: {
  initialChargeId?: string;
  rows: RentChargeRow[];
  store: LocalStore;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (form: RegisterPaymentForm) => void;
}) {
  const payableRows = rows.filter((row) => row.balance > 0 && !row.hasAnomaly).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [form, setForm] = useState<RegisterPaymentForm>(() => {
    const firstRow = payableRows.find((row) => row.id === initialChargeId) ?? payableRows[0];

    return {
      chargeIds: firstRow ? [firstRow.id] : [],
      amountReceived: firstRow?.balance ?? 0,
      receivedAt: getTodayIsoDate(),
      method: "virement",
      reference: "",
      notes: "",
    };
  });
  const selectedRows = payableRows.filter((row) => form.chargeIds.includes(row.id));
  const selectedBalance = selectedRows.reduce((sum, row) => sum + row.balance, 0);
  const tenantContext = selectedRows[0] ? getTenantDisplayName(selectedRows[0], store) : "Aucun loyer sélectionné";

  function toggleCharge(chargeId: string) {
    setForm((current) => {
      const selected = current.chargeIds.includes(chargeId)
        ? current.chargeIds.filter((id) => id !== chargeId)
        : [...current.chargeIds, chargeId];
      const nextBalance = payableRows
        .filter((row) => selected.includes(row.id))
        .reduce((sum, row) => sum + row.balance, 0);

      return {
        ...current,
        chargeIds: selected,
        amountReceived: nextBalance || current.amountReceived,
      };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Encaissement réel</p>
            <h2 className="mt-1 text-2xl font-semibold">Enregistrer un paiement</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Date reçue: argent encaissé réellement. Échéance: date où le loyer était dû.
            </p>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="text-xs font-semibold uppercase text-[var(--muted)]">Bail / locataire</p>
            <p className="mt-1 font-semibold text-[var(--foreground)]">{tenantContext}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Montant reçu"
              type="number"
              value={form.amountReceived.toString()}
              onChange={(amountReceived) => setForm({ ...form, amountReceived: Number(amountReceived) })}
            />
            <TextInput
              label="Date de réception"
              type="date"
              value={form.receivedAt}
              onChange={(receivedAt) => setForm({ ...form, receivedAt })}
            />
            <SelectInput
              label="Méthode"
              value={form.method}
              onChange={(method) => setForm({ ...form, method: method as PaymentMethod })}
              options={paymentMethods.map((method) => [method.value, method.label])}
            />
            <TextInput
              label="Référence"
              value={form.reference}
              onChange={(reference) => setForm({ ...form, reference })}
            />
          </div>

          <TextInput label="Notes" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />

          <div className="rounded-lg border border-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--foreground)]">Loyers à appliquer</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Solde sélectionné: {currency.format(selectedBalance)}. Un trop-payé sera traité comme crédit locataire.
              </p>
            </div>
            <div className="custom-scrollbar max-h-[260px] overflow-y-auto">
              {payableRows.map((row) => (
                <label
                  key={row.id}
                  className="grid cursor-pointer grid-cols-[auto_1fr_auto] gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 hover:bg-[var(--surface-2)]"
                >
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={form.chargeIds.includes(row.id)}
                    onChange={() => toggleCharge(row.id)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[var(--foreground)]">
                      {getTenantDisplayName(row, store)} · {row.periodMonth}
                    </span>
                    <span className="mt-1 block truncate text-sm text-[var(--muted)]">
                      {getPropertyName(row.propertyId, store)} · {getUnitLabel(row.unitId, store)} · échéance {formatShortDate(row.dueDate)}
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold text-[var(--foreground)]">{currency.format(row.balance)}</span>
                </label>
              ))}
              {payableRows.length === 0 ? (
                <p className="px-4 py-5 text-sm text-[var(--muted)]">Aucun solde à recevoir pour le moment.</p>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary" onClick={onCancel} type="button">
              Annuler
            </button>
            <button
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving || form.chargeIds.length === 0 || form.amountReceived <= 0}
              onClick={() => onSave(form)}
              type="button"
            >
              {isSaving ? "Enregistrement..." : "Enregistrer le paiement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChargeDetailsModal({
  ledger,
  row,
  store,
  onCancel,
}: {
  ledger: RentLedger;
  row: RentChargeRow;
  store: LocalStore;
  onCancel: () => void;
}) {
  const history = getChargeTransactionHistory(row, ledger.allocations, ledger.transactions);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Loyer {row.periodMonth}</p>
            <h2 className="mt-1 text-2xl font-semibold">{getTenantDisplayName(row, store)}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {getPropertyName(row.propertyId, store)} · {getUnitLabel(row.unitId, store)}
            </p>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoItem label="Montant dû" value={currency.format(row.amountDue)} />
          <InfoItem label="Montant reçu" value={currency.format(row.amountAllocated)} />
          <InfoItem label="Solde" value={currency.format(row.balance)} />
          <InfoItem label="Crédit locataire" value={currency.format(row.credit)} />
          <InfoItem label="Échéance" value={formatShortDate(row.dueDate)} />
          <InfoItem label="Dernier paiement" value={row.lastPaymentAt ? formatShortDate(row.lastPaymentAt) : "—"} />
        </div>
        <div className="mt-5 rounded-lg border border-[var(--border)]">
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--foreground)]">Historique des paiements</p>
          </div>
          <div className="grid gap-0">
            {history.map((entry) => (
              <div key={entry.id} className="border-b border-[var(--border)] px-4 py-3 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[var(--foreground)]">{currency.format(entry.amountAllocated)}</p>
                  <p className="text-sm text-[var(--muted)]">{formatShortDate(entry.receivedAt)}</p>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {getPaymentMethodLabel(entry.method)}
                  {entry.reference ? ` · Réf. ${entry.reference}` : ""}
                </p>
              </div>
            ))}
            {history.length === 0 ? (
              <p className="px-4 py-5 text-sm text-[var(--muted)]">Aucune transaction enregistrée pour ce loyer.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
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

function getChargeSections(rows: RentChargeRow[], filter: PaymentWorkspaceFilter, selectedMonth: string, today: string): ChargeSection[] {
  if (!selectedMonth || !today) {
    return [];
  }

  if (filter === "attention") {
    return [{
      id: "attention",
      title: "À traiter",
      rows: rows.filter((row) => isActionRequired(row, today)).sort(compareAttentionRows(today)),
    }].filter((section) => section.rows.length > 0);
  }

  if (filter === "payes") {
    return groupRowsByMonth(
      rows.filter((row) => row.status === "payé" && !row.hasAnomaly),
      "Payés",
      false,
    );
  }

  if (filter === "avenir") {
    return groupFutureRows(rows.filter((row) => row.balance > 0 && row.dueDate >= today && !row.hasAnomaly), selectedMonth);
  }

  if (filter === "historique") {
    return groupRowsByMonth(
      rows.filter((row) => row.status === "payé" && row.periodMonth < selectedMonth && !row.hasAnomaly).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
      "Historique",
      true,
    );
  }

  const nextMonth = addMonthsToMonth(selectedMonth, 1);
  const overdue = rows.filter((row) => isOverdue(row, today) || row.hasAnomaly).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdueIds = new Set(overdue.map((row) => row.id));
  const current = rows
    .filter((row) => !overdueIds.has(row.id) && row.periodMonth === selectedMonth)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = rows
    .filter((row) => !overdueIds.has(row.id) && row.periodMonth === nextMonth)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const later = rows
    .filter((row) => !overdueIds.has(row.id) && row.periodMonth > nextMonth)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const history = rows
    .filter((row) => !overdueIds.has(row.id) && row.periodMonth < selectedMonth && row.status === "payé")
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  return [
    { id: "overdue", title: "En retard", rows: overdue },
    { id: "current", title: formatMonthLabel(selectedMonth), rows: current },
    { id: "next", title: formatMonthLabel(nextMonth), rows: next },
    { id: "later", title: "Plus tard", rows: later, collapsible: true },
    { id: "history", title: "Historique", rows: history },
  ].filter((section) => section.rows.length > 0);
}

function groupFutureRows(rows: RentChargeRow[], selectedMonth: string): ChargeSection[] {
  const nextMonth = addMonthsToMonth(selectedMonth, 1);
  const current = rows.filter((row) => row.periodMonth === selectedMonth).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = rows.filter((row) => row.periodMonth === nextMonth).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const later = rows.filter((row) => row.periodMonth > nextMonth).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return [
    { id: "future-current", title: formatMonthLabel(selectedMonth), rows: current },
    { id: "future-next", title: formatMonthLabel(nextMonth), rows: next },
    { id: "future-later", title: "Plus tard", rows: later, collapsible: true },
  ].filter((section) => section.rows.length > 0);
}

function groupRowsByMonth(rows: RentChargeRow[], prefix: string, descending: boolean): ChargeSection[] {
  const grouped = new Map<string, RentChargeRow[]>();

  rows.forEach((row) => {
    grouped.set(row.periodMonth, [...(grouped.get(row.periodMonth) ?? []), row]);
  });

  return [...grouped.entries()]
    .sort(([a], [b]) => (descending ? b.localeCompare(a) : a.localeCompare(b)))
    .map(([month, monthRows]) => ({
      id: `${prefix}-${month}`,
      title: `${prefix} · ${formatMonthLabel(month)}`,
      rows: [...monthRows].sort((a, b) => (descending ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate))),
    }));
}

function getFilterDefinitions(counts: Record<PaymentWorkspaceFilter, number>): { icon: IconName; label: string; value: PaymentWorkspaceFilter }[] {
  return [
    { icon: "circle-alert", label: `À traiter (${counts.attention})`, value: "attention" },
    { icon: "list", label: `Tous (${counts.tous})`, value: "tous" },
    { icon: "circle-check", label: `Payés (${counts.payes})`, value: "payes" },
    { icon: "clock", label: `À venir (${counts.avenir})`, value: "avenir" },
    { icon: "history", label: `Historique (${counts.historique})`, value: "historique" },
  ];
}

function getFilterCounts(rows: RentChargeRow[], selectedMonth: string, today: string): Record<PaymentWorkspaceFilter, number> {
  if (!today || !selectedMonth) {
    return {
      attention: 0,
      tous: 0,
      payes: 0,
      avenir: 0,
      historique: 0,
    };
  }

  return {
    attention: rows.filter((row) => isActionRequired(row, today)).length,
    tous: rows.length,
    payes: rows.filter((row) => row.status === "payé" && !row.hasAnomaly).length,
    avenir: rows.filter((row) => row.balance > 0 && row.dueDate >= today && !row.hasAnomaly).length,
    historique: rows.filter((row) => row.status === "payé" && row.periodMonth < selectedMonth && !row.hasAnomaly).length,
  };
}

function isActionRequired(row: RentChargeRow, today: string) {
  return row.hasAnomaly || isOverdue(row, today) || row.status === "partiel" || isDueWithinDays(row, today, 7);
}

function isOverdue(row: RentChargeRow, today: string) {
  return row.balance > 0 && row.dueDate < today;
}

function isDueWithinDays(row: RentChargeRow, today: string, days: number) {
  return row.balance > 0 && row.dueDate >= today && row.dueDate <= addDaysIso(today, days);
}

function compareAttentionRows(today: string) {
  return (a: RentChargeRow, b: RentChargeRow) => {
    const priorityDifference = getAttentionPriority(a, today) - getAttentionPriority(b, today);

    return priorityDifference || a.dueDate.localeCompare(b.dueDate);
  };
}

function getAttentionPriority(row: RentChargeRow, today: string) {
  if (row.hasAnomaly) {
    return 0;
  }

  if (isOverdue(row, today)) {
    return 1;
  }

  if (row.status === "partiel") {
    return 2;
  }

  return 3;
}

function getActionLabel(row: RentChargeRow) {
  if (row.hasAnomaly) {
    return "Voir";
  }

  if (row.status === "partiel") {
    return "Compléter";
  }

  return row.balance > 0 ? "Enregistrer" : "Voir";
}

function getTenantDisplayName(row: RentChargeRow, store: LocalStore) {
  const tenant = row.tenantId ? store.tenants.find((candidate) => candidate.id === row.tenantId) : null;

  if (tenant) {
    return tenant.fullName?.trim() || `${tenant.firstName} ${tenant.lastName}`.trim();
  }

  return row.anomalyReason ? "Locataire à corriger" : "Locataire introuvable";
}

function getChargeTransactionHistory(row: RentChargeRow, allocations: PaymentAllocation[], transactions: PaymentTransaction[]) {
  const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  return allocations
    .filter((allocation) => allocation.rentChargeId === row.id)
    .map((allocation) => {
      const transaction = transactionsById.get(allocation.transactionId);

      return transaction
        ? {
            id: allocation.id,
            amountAllocated: allocation.amountAllocated,
            method: transaction.method,
            receivedAt: transaction.receivedAt,
            reference: transaction.reference ?? "",
          }
        : null;
    })
    .filter((entry): entry is { id: string; amountAllocated: number; method: PaymentMethod; receivedAt: string; reference: string } => Boolean(entry))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

function getPaymentMethodLabel(method: PaymentMethod) {
  return paymentMethods.find((candidate) => candidate.value === method)?.label ?? "Paiement";
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber) {
    return "Mois";
  }

  return `${monthNames[monthNumber - 1]} ${year}`;
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");

  if (!month || !day) {
    return date;
  }

  return `${Number(day)} ${monthNames[Number(month) - 1].toLowerCase()}`;
}

function addMonthsToMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);

  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function addDaysIso(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day + days);

  return `${nextDate.getFullYear()}-${`${nextDate.getMonth() + 1}`.padStart(2, "0")}-${`${nextDate.getDate()}`.padStart(2, "0")}`;
}

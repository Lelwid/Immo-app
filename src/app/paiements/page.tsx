"use client";

import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { createActivityRecord } from "@/lib/data/activitiesService";
import { addActivityToStore } from "@/lib/data/activityStore";
import { updatePayment } from "@/lib/data/paymentsService";
import { loadPortfolioSnapshot, refreshSnapshot, type PortfolioSnapshot } from "@/lib/data/portfolioSnapshotService";
import {
  currency,
  getPaymentSummary,
  getPayments as getEnrichedPayments,
  rentPaymentStatusLabel,
} from "@/lib/mockData";
import type { PaymentRecord, RentPaymentStatus } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type PaymentFilter = "tous" | RentPaymentStatus;
type PaymentForm = Pick<PaymentRecord, "amountPaid" | "paidAt" | "status" | "notes">;

const filters: { label: string; value: PaymentFilter }[] = [
  { label: "Tous", value: "tous" },
  { label: "Payé", value: "payé" },
  { label: "Partiel", value: "partiel" },
  { label: "En retard", value: "en retard" },
  { label: "À venir", value: "à venir" },
];

const statusClasses: Record<RentPaymentStatus, string> = {
  payé: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
  partiel: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  "en retard": "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
  "à venir": "border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
};

export default function PaiementsPage() {
  const { store, setStore } = useLocalStore();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<PaymentFilter>("tous");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const snapshotStore = snapshot ?? store;
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    amountPaid: 0,
    paidAt: "",
    status: "à venir",
    notes: "",
  });

  useEffect(() => {
    let active = true;

    loadPortfolioSnapshot()
      .then((nextSnapshot) => {
        if (!active) {
          return;
        }

        setSnapshot(nextSnapshot);
        setErrorMessage("");
      })
      .catch(() => {
        if (active) {
          setErrorMessage("Impossible de charger les paiements. Les données locales sont affichées.");
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

  async function refreshPaymentsSnapshot() {
    try {
      const nextSnapshot = await refreshSnapshot();
      setSnapshot(nextSnapshot);
      setErrorMessage("");
    } catch (error) {
      console.error("Impossible de rafraîchir les paiements.", error);
      setErrorMessage("Impossible de rafraîchir les paiements. Les données locales sont affichées.");
    }
  }

  const summary = useMemo(() => getPaymentSummary(snapshotStore), [snapshotStore]);
  const payments = useMemo(
    () => getEnrichedPayments(snapshotStore).filter((payment) => activeFilter === "tous" || payment.status === activeFilter),
    [activeFilter, snapshotStore],
  );
  const editingPayment = snapshotStore.payments.find((payment) => payment.id === editingPaymentId) ?? null;

  function editPayment(payment: PaymentRecord) {
    setEditingPaymentId(payment.id);
    setPaymentForm({
      amountPaid: payment.amountPaid,
      paidAt: payment.paidAt,
      status: payment.status,
      notes: payment.notes,
    });
  }

  async function savePayment() {
    if (!editingPayment) {
      return;
    }

    const previousPayment = snapshotStore.payments.find((payment) => payment.id === editingPayment.id) ?? editingPayment;
    const statusChanged = previousPayment.status !== paymentForm.status;
    const shouldCreateActivity =
      statusChanged ||
      previousPayment.amountPaid !== paymentForm.amountPaid ||
      previousPayment.paidAt !== paymentForm.paidAt ||
      previousPayment.notes !== paymentForm.notes;

    setIsSaving(true);
    setErrorMessage("");

    try {
      const savedPayment = await updatePayment(editingPayment.id, paymentForm);

      let activity = null;

      if (shouldCreateActivity) {
        try {
          activity = await createActivityRecord({
            propertyId: savedPayment.propertyId,
            unitId: savedPayment.unitId,
            tenantId: savedPayment.tenantId,
            date: savedPayment.paidAt || new Date().toISOString().slice(0, 10),
            type: "paiement",
            title: statusChanged ? getPaymentActivityTitle(savedPayment.status) : "Paiement mis à jour",
            description: statusChanged
              ? getPaymentActivityDescription(savedPayment)
              : `Paiement de ${savedPayment.month} mis à jour. Montant reçu: ${currency.format(savedPayment.amountPaid)}.`,
          });
        } catch (error) {
          console.error("Impossible de créer l'activité de paiement.", error);
        }
      }

      setStore((current) => {
        const nextStore = {
          ...current,
          payments: current.payments.map((payment) => (payment.id === savedPayment.id ? savedPayment : payment)),
        };

        return activity ? addActivityToStore(nextStore, activity) : nextStore;
      });

      await refreshPaymentsSnapshot();

      setEditingPaymentId(null);
    } catch {
      setErrorMessage("Impossible de modifier le paiement.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RouteShell
      title="Paiements"
      description="Suivi des loyers, encaissements, soldes dus et retards par logement."
    >
      <section className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Loyers attendus ce mois-ci" value={currency.format(summary.expected)} />
          <Metric label="Loyers reçus" value={currency.format(summary.received)} />
          <Metric label="En retard" value={currency.format(summary.late)} />
          <Metric label="Solde dû" value={currency.format(summary.balanceDue)} />
        </div>

        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          {filters.map((filter) => {
            const active = activeFilter === filter.value;

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
                {filter.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          {snapshotLoading ? (
            <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)]">
              Synchronisation des paiements...
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mb-4 rounded-lg border border-[color:var(--red)]/35 bg-[color:var(--red)]/10 px-4 py-3 text-sm font-semibold text-[color:var(--red)]">
              {errorMessage}
            </div>
          ) : null}
          <div className="custom-scrollbar overflow-x-auto rounded-lg border border-[var(--border)]">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[1.2fr_0.8fr_1fr_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-3 bg-[var(--surface-2)] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)]">
                <span>Immeuble</span>
                <span>Logement</span>
                <span>Locataire</span>
                <span>Mois</span>
                <span>Montant dû</span>
                <span>Montant payé</span>
                <span>Statut</span>
                <span>Date paiement</span>
                <span>Action</span>
              </div>
              {payments.map((payment) => (
                <button
                  key={payment.id}
                  type="button"
                  onClick={() => editPayment(payment)}
                  className="grid w-full grid-cols-[1.2fr_0.8fr_1fr_0.7fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-3 border-t border-[var(--border)] px-4 py-3 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
                >
                  <span>{payment.propertyName}</span>
                  <span className="text-[var(--muted)]">{payment.unitLabel}</span>
                  <span>{payment.tenantName}</span>
                  <span>{payment.month}</span>
                  <span>{currency.format(payment.amountDue)}</span>
                  <span>{currency.format(payment.amountPaid)}</span>
                  <span>
                    <StatusBadge status={payment.status} />
                  </span>
                  <span>{payment.paidAt || "—"}</span>
                  <span className="font-semibold text-[color:var(--accent)]">Modifier</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {editingPayment ? (
          <PaymentModal
            form={paymentForm}
            onCancel={() => setEditingPaymentId(null)}
            onChange={setPaymentForm}
            isSaving={isSaving}
            onSave={savePayment}
            payment={editingPayment}
          />
        ) : null}
      </section>
    </RouteShell>
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

function StatusBadge({ status }: { status: RentPaymentStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {rentPaymentStatusLabel[status]}
    </span>
  );
}

function PaymentModal({
  form,
  onCancel,
  onChange,
  isSaving,
  onSave,
  payment,
}: {
  form: PaymentForm;
  onCancel: () => void;
  onChange: (form: PaymentForm) => void;
  isSaving: boolean;
  onSave: () => void;
  payment: PaymentRecord;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Paiement {payment.month}</p>
            <h2 className="mt-1 text-2xl font-semibold">Modifier le paiement</h2>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>
        <div className="grid gap-3">
          <TextInput
            label="Montant payé"
            type="number"
            value={form.amountPaid.toString()}
            onChange={(amountPaid) => onChange({ ...form, amountPaid: Number(amountPaid) })}
          />
          <TextInput label="Date paiement" type="date" value={form.paidAt} onChange={(paidAt) => onChange({ ...form, paidAt })} />
          <SelectInput
            label="Statut"
            value={form.status}
            onChange={(status) => onChange({ ...form, status: status as RentPaymentStatus })}
            options={[
              ["payé", "Payé"],
              ["partiel", "Partiel"],
              ["en retard", "En retard"],
              ["à venir", "À venir"],
            ]}
          />
          <TextInput label="Notes" value={form.notes} onChange={(notes) => onChange({ ...form, notes })} />
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="btn-secondary" onClick={onCancel} type="button">
              Annuler
            </button>
            <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={onSave} type="button">
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
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

function getPaymentActivityTitle(status: RentPaymentStatus) {
  const titles: Record<RentPaymentStatus, string> = {
    payé: "Paiement reçu",
    partiel: "Paiement partiel",
    "en retard": "Paiement en retard",
    "à venir": "Paiement à venir",
  };

  return titles[status];
}

function getPaymentActivityDescription(payment: PaymentRecord) {
  if (payment.status === "payé") {
    return `Loyer de ${payment.month} marqué comme payé.`;
  }

  if (payment.status === "partiel") {
    return `Paiement partiel de ${currency.format(payment.amountPaid)} reçu pour ${payment.month}.`;
  }

  return `Loyer de ${payment.month} marqué en retard.`;
}

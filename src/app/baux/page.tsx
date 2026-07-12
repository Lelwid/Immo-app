"use client";

import { useEffect, useMemo, useState } from "react";
import { RouteShell } from "@/app/components/route-shell";
import { getUnitOccupancy } from "@/lib/data/leaseAdapters";
import { saveLeaseForUnit } from "@/lib/data/leaseAssignmentService";
import { loadPortfolioSnapshot, refreshSnapshot, type PortfolioSnapshot } from "@/lib/data/portfolioSnapshotService";
import { currency, getPropertyDashboards, paymentStatusLabel, renewalStatusLabel } from "@/lib/mockData";
import type { Unit } from "@/lib/types";
import { useLocalStore } from "@/lib/useLocalStore";

type LeaseForm = Pick<Unit, "tenantId" | "monthlyRent" | "leaseStartDate" | "leaseEndDate" | "paymentStatus" | "notes">;

export default function BauxPage() {
  const { store, setStore } = useLocalStore();
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const snapshotStore = snapshot ?? store;
  const properties = useMemo(() => getPropertyDashboards(snapshotStore), [snapshotStore]);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [showLeaseModal, setShowLeaseModal] = useState(false);
  const [leaseForm, setLeaseForm] = useState<LeaseForm>({
    tenantId: null,
    monthlyRent: 0,
    leaseStartDate: "",
    leaseEndDate: "",
    paymentStatus: "paid",
    notes: "",
  });

  useEffect(() => {
    let active = true;

    loadPortfolioSnapshot()
      .then((nextSnapshot) => {
        if (active) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((error) => {
        console.error("Impossible de charger les baux.", error);
      });

    return () => {
      active = false;
    };
  }, []);

  async function refreshBauxSnapshot() {
    try {
      setSnapshot(await refreshSnapshot());
    } catch (error) {
      console.error("Impossible de rafraîchir les baux.", error);
    }
  }

  function editLease(unit: Unit) {
    const occupancy = getUnitOccupancy(unit, snapshotStore.leases, snapshotStore.tenants);
    const activeLease = snapshotStore.leases.find((lease) => lease.unitId === unit.id && lease.status === "active");

    setEditingUnitId(unit.id);
    setLeaseForm({
      tenantId: occupancy.tenantId,
      monthlyRent: occupancy.monthlyRent,
      leaseStartDate: occupancy.leaseStartDate,
      leaseEndDate: occupancy.leaseEndDate,
      paymentStatus: occupancy.paymentStatus,
      notes: activeLease?.notes ?? unit.notes,
    });
    setShowLeaseModal(true);
  }

  async function saveLease() {
    if (!editingUnitId) {
      return;
    }

    setStore(await saveLeaseForUnit(snapshotStore, {
      unitId: editingUnitId,
      tenantId: leaseForm.tenantId,
      monthlyRent: leaseForm.monthlyRent,
      leaseStartDate: leaseForm.leaseStartDate,
      leaseEndDate: leaseForm.leaseEndDate,
      paymentStatus: leaseForm.paymentStatus,
      notes: leaseForm.notes,
    }));
    await refreshBauxSnapshot();
    setEditingUnitId(null);
    setShowLeaseModal(false);
  }

  function cancelLeaseEdit() {
    setEditingUnitId(null);
    setShowLeaseModal(false);
  }

  return (
    <RouteShell
      title="Baux"
      description="Suivi et modification des baux actifs, loyers, échéances et statuts de paiement par immeuble."
    >
      <section className="grid gap-5">
        <div className="grid gap-5">
          {properties.map((property) => (
            <article key={property.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">{property.name}</h2>
              <div className="custom-scrollbar mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_0.8fr_1fr_1fr_0.8fr] gap-3 bg-[var(--surface-2)] px-4 py-3 text-xs font-semibold uppercase text-[var(--muted)]">
                    <span>Locataire</span>
                    <span>Logement</span>
                    <span>Début du bail</span>
                    <span>Fin du bail</span>
                    <span>Loyer</span>
                    <span>Paiement</span>
                    <span>Renouvellement</span>
                    <span>Action</span>
                  </div>
                  {property.units.map((unit) => {
                    const occupancy = getUnitOccupancy(unit, snapshotStore.leases, snapshotStore.tenants);

                    return (
                      <div
                        key={unit.id}
                        className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_0.8fr_1fr_1fr_0.8fr] gap-3 border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        <span>{occupancy.tenantName}</span>
                        <span className="text-[var(--muted)]">{occupancy.unitName}</span>
                        <span>{occupancy.leaseStartDate}</span>
                        <span>{occupancy.leaseEndDate}</span>
                        <span>{currency.format(occupancy.monthlyRent)}</span>
                        <span>{paymentStatusLabel[occupancy.paymentStatus]}</span>
                        <span>{renewalStatusLabel[occupancy.paymentStatus]}</span>
                        <button className="text-left text-sm font-semibold text-[color:var(--accent)]" onClick={() => editLease(unit)} type="button">
                          Modifier
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="hidden">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {editingUnitId ? "Modifier le bail" : "Sélectionner un bail"}
          </h2>
          <div className="mt-4 grid gap-3">
            <SelectInput
              label="Locataire"
              value={leaseForm.tenantId ?? ""}
              onChange={(tenantId) => setLeaseForm({ ...leaseForm, tenantId: tenantId || null })}
              options={[["", "Vacant"], ...snapshotStore.tenants.filter((tenant) => !tenant.archivedAt).map((tenant) => [tenant.id, `${tenant.firstName} ${tenant.lastName}`])]}
              disabled={!editingUnitId}
            />
            <TextInput label="Loyer" type="number" value={leaseForm.monthlyRent.toString()} onChange={(monthlyRent) => setLeaseForm({ ...leaseForm, monthlyRent: Number(monthlyRent) })} disabled={!editingUnitId} />
            <TextInput label="Début du bail" type="date" value={leaseForm.leaseStartDate} onChange={(leaseStartDate) => setLeaseForm({ ...leaseForm, leaseStartDate })} disabled={!editingUnitId} />
            <TextInput label="Fin du bail" type="date" value={leaseForm.leaseEndDate} onChange={(leaseEndDate) => setLeaseForm({ ...leaseForm, leaseEndDate })} disabled={!editingUnitId} />
            <SelectInput
              label="Statut des paiements"
              value={leaseForm.paymentStatus}
              onChange={(paymentStatus) => setLeaseForm({ ...leaseForm, paymentStatus: paymentStatus as Unit["paymentStatus"] })}
              options={[
                ["paid", "Payé"],
                ["dueSoon", "Dû bientôt"],
                ["late", "En retard"],
              ]}
              disabled={!editingUnitId}
            />
            <TextInput label="Notes" value={leaseForm.notes} onChange={(notes) => setLeaseForm({ ...leaseForm, notes })} disabled={!editingUnitId} />
            <button className="btn-primary" onClick={saveLease} type="button" disabled={!editingUnitId}>
              Enregistrer le bail
            </button>
          </div>
        </aside>

        {showLeaseModal ? (
          <FormModal title="Modifier le bail" onCancel={cancelLeaseEdit}>
            <div className="grid gap-3">
              <SelectInput
                label="Locataire"
                value={leaseForm.tenantId ?? ""}
                onChange={(tenantId) => setLeaseForm({ ...leaseForm, tenantId: tenantId || null })}
                options={[["", "Vacant"], ...snapshotStore.tenants.filter((tenant) => !tenant.archivedAt).map((tenant) => [tenant.id, `${tenant.firstName} ${tenant.lastName}`])]}
              />
              <TextInput label="Loyer" type="number" value={leaseForm.monthlyRent.toString()} onChange={(monthlyRent) => setLeaseForm({ ...leaseForm, monthlyRent: Number(monthlyRent) })} />
              <TextInput label="Début du bail" type="date" value={leaseForm.leaseStartDate} onChange={(leaseStartDate) => setLeaseForm({ ...leaseForm, leaseStartDate })} />
              <TextInput label="Fin du bail" type="date" value={leaseForm.leaseEndDate} onChange={(leaseEndDate) => setLeaseForm({ ...leaseForm, leaseEndDate })} />
              <SelectInput
                label="Statut des paiements"
                value={leaseForm.paymentStatus}
                onChange={(paymentStatus) => setLeaseForm({ ...leaseForm, paymentStatus: paymentStatus as Unit["paymentStatus"] })}
                options={[
                  ["paid", "Payé"],
                  ["dueSoon", "Dû bientôt"],
                  ["late", "En retard"],
                ]}
              />
              <TextInput label="Notes" value={leaseForm.notes} onChange={(notes) => setLeaseForm({ ...leaseForm, notes })} />
              <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button className="btn-secondary" onClick={cancelLeaseEdit} type="button">
                  Annuler
                </button>
                <button className="btn-primary" onClick={saveLease} type="button">
                  Enregistrer le bail
                </button>
              </div>
            </div>
          </FormModal>
        ) : null}
      </section>
    </RouteShell>
  );
}

function FormModal({
  children,
  onCancel,
  title,
}: {
  children: React.ReactNode;
  onCancel: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Gestion des baux</p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none disabled:opacity-50 focus:border-[color:var(--accent)]"
        disabled={disabled}
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none disabled:opacity-50 focus:border-[color:var(--accent)]"
        disabled={disabled}
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

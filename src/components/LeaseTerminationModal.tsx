"use client";

import { useMemo, useState } from "react";
import type { LeaseTerminationWorkflowInput } from "@/lib/data/leaseAssignmentService";
import type { Lease } from "@/lib/types";

const terminationReasons = [
  "Fin normale du bail",
  "Départ anticipé",
  "Résiliation",
  "Reprise du logement",
  "Autre",
];

export function LeaseTerminationModal({
  error,
  lease,
  onCancel,
  onConfirm,
  saving = false,
}: {
  error?: string | null;
  lease: Lease;
  onCancel: () => void;
  onConfirm: (input: LeaseTerminationWorkflowInput) => void | Promise<void>;
  saving?: boolean;
}) {
  const [actualEndDate, setActualEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [terminationReason, setTerminationReason] = useState(terminationReasons[0]);
  const [terminationNotes, setTerminationNotes] = useState("");
  const validationError = useMemo(() => validateTerminationDate(actualEndDate, lease.startDate), [actualEndDate, lease.startDate]);
  const canConfirm = !saving && !validationError;

  async function submit() {
    if (!canConfirm) {
      return;
    }

    await onConfirm({
      actualEndDate,
      terminationReason,
      terminationNotes,
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--foreground)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase text-[var(--muted)]">Gestion du bail</p>
            <h2 className="mt-1 text-2xl font-semibold">Terminer le bail</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Le logement deviendra vacant. Le locataire et l&apos;historique du bail seront conservés.
            </p>
          </div>
          <button
            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            Fermer
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
            <p className="text-xs font-semibold uppercase text-[var(--muted)]">Bail actif</p>
            <p className="mt-2 text-sm text-[var(--foreground)]">
              Début prévu: <span className="font-semibold">{lease.startDate}</span>
            </p>
            <p className="mt-1 text-sm text-[var(--foreground)]">
              Fin prévue: <span className="font-semibold">{lease.endDate}</span>
            </p>
          </div>

          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Date de fin réelle
            <input
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              disabled={saving}
              onChange={(event) => setActualEndDate(event.target.value)}
              type="date"
              value={actualEndDate}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Motif
            <select
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              disabled={saving}
              onChange={(event) => setTerminationReason(event.target.value)}
              value={terminationReason}
            >
              {terminationReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
            Notes optionnelles
            <textarea
              className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
              disabled={saving}
              onChange={(event) => setTerminationNotes(event.target.value)}
              value={terminationNotes}
            />
          </label>
        </div>

        {validationError ? <p className="mt-4 text-sm font-semibold text-[color:var(--red)]">{validationError}</p> : null}
        {error ? <p className="mt-4 text-sm font-semibold text-[color:var(--red)]">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="btn-secondary" disabled={saving} onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-danger disabled:cursor-not-allowed disabled:opacity-40" disabled={!canConfirm} onClick={submit} type="button">
            {saving ? "Traitement..." : "Terminer le bail"}
          </button>
        </div>
      </div>
    </div>
  );
}

function validateTerminationDate(actualEndDate: string, leaseStartDate: string) {
  if (!actualEndDate) {
    return "La date de fin réelle est obligatoire.";
  }

  if (Number.isNaN(Date.parse(actualEndDate))) {
    return "La date de fin réelle est invalide.";
  }

  if (leaseStartDate && actualEndDate < leaseStartDate) {
    return "La date de fin réelle ne peut pas être avant le début du bail.";
  }

  return "";
}

"use client";

import {
  EmptyTenantState,
  formatCurrency,
  formatDate,
  statusTone,
  TenantCard,
  TenantPortalContent,
  TenantStatusBadge,
} from "@/components/tenant-portal/TenantPortalContent";

export default function TenantPortalPaiementsPage() {
  return (
    <TenantPortalContent title="Mes paiements" description="Historique des loyers exigibles et des paiements reçus.">
      {(snapshot) => {
        const rows = snapshot.ledger.rows;

        return (
          <TenantCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Registre de loyer</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{rows.length} période{rows.length > 1 ? "s" : ""} visible{rows.length > 1 ? "s" : ""}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {rows.length === 0 ? <EmptyTenantState text="Aucun loyer n'est disponible pour le moment." /> : null}
              {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">Période {row.periodMonth}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">Échéance {formatDate(row.dueDate)}</p>
                      {row.lastPaymentAt ? <p className="mt-1 text-xs text-[var(--muted)]">Dernier paiement: {formatDate(row.lastPaymentAt)}</p> : null}
                    </div>
                    <TenantStatusBadge tone={statusTone(row.status)}>{row.status}</TenantStatusBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                    <AmountTile label="Dû" value={row.amountDue} />
                    <AmountTile label="Reçu" value={row.amountAllocated} />
                    <AmountTile label="Solde" value={row.balance} />
                  </div>
                </article>
              ))}
            </div>
          </TenantCard>
        );
      }}
    </TenantPortalContent>
  );
}

function AmountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--foreground)]">{formatCurrency(value)}</p>
    </div>
  );
}

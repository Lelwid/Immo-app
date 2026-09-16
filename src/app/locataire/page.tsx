"use client";

import {
  formatCurrency,
  formatDate,
  getTenantAddress,
  priorityLabel,
  QuickLink,
  statusTone,
  TenantCard,
  TenantPortalContent,
  TenantStatusBadge,
} from "@/components/tenant-portal/TenantPortalContent";
import type { RentChargeRow } from "@/lib/data/rentLedgerService";

export default function TenantPortalHomePage() {
  return (
    <TenantPortalContent title="Accueil" description="Suivez votre logement, votre bail, vos paiements et vos demandes.">
      {(snapshot, context) => {
        const nextCharge = getNextRelevantCharge(snapshot.ledger.rows);
        const openTickets = snapshot.maintenanceRequests.filter((ticket) => ticket.status !== "resolved");
        const sharedDocuments = snapshot.documents.filter((document) => document.visibility === "tenant");

        return (
          <div className="grid gap-4">
            <TenantCard className="bg-[color:var(--accent)]/12">
              <p className="text-sm text-[var(--muted)]">Votre logement</p>
              <h2 className="mt-1 text-2xl font-bold">{getTenantAddress(context)}</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">{context.property?.address}</p>
            </TenantCard>

            <div className="grid gap-3 sm:grid-cols-3">
              <TenantCard>
                <p className="text-sm text-[var(--muted)]">Prochain loyer</p>
                <p className="mt-2 text-2xl font-bold">{nextCharge ? formatCurrency(nextCharge.balance || nextCharge.amountDue) : "—"}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{nextCharge ? `Échéance ${formatDate(nextCharge.dueDate)}` : "Aucun loyer actif"}</p>
              </TenantCard>
              <TenantCard>
                <p className="text-sm text-[var(--muted)]">Documents partagés</p>
                <p className="mt-2 text-2xl font-bold">{sharedDocuments.length}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Visibles dans votre portail</p>
              </TenantCard>
              <TenantCard>
                <p className="text-sm text-[var(--muted)]">Demandes ouvertes</p>
                <p className="mt-2 text-2xl font-bold">{openTickets.length}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Entretien en suivi</p>
              </TenantCard>
            </div>

            <TenantCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Actions rapides</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">Accédez aux tâches les plus fréquentes.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <QuickLink href="/locataire/paiements" label="Voir mes paiements" />
                <QuickLink href="/locataire/documents" label="Consulter mes documents" />
                <QuickLink href="/locataire/entretien" label="Créer une demande" />
              </div>
            </TenantCard>

            <TenantCard>
              <h2 className="text-lg font-semibold">À surveiller</h2>
              <div className="mt-4 grid gap-3">
                {nextCharge ? (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">Loyer {nextCharge.periodMonth}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">Solde: {formatCurrency(nextCharge.balance)}</p>
                      </div>
                      <TenantStatusBadge tone={statusTone(nextCharge.status)}>{nextCharge.status}</TenantStatusBadge>
                    </div>
                  </div>
                ) : null}
                {openTickets.slice(0, 2).map((ticket) => (
                  <div key={ticket.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{ticket.title}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">Créée le {formatDate(ticket.createdAt)}</p>
                      </div>
                      <TenantStatusBadge tone={statusTone(ticket.priority)}>{priorityLabel(ticket.priority)}</TenantStatusBadge>
                    </div>
                  </div>
                ))}
                {!nextCharge && openTickets.length === 0 ? <p className="text-sm text-[var(--muted)]">Tout est à jour.</p> : null}
              </div>
            </TenantCard>
          </div>
        );
      }}
    </TenantPortalContent>
  );
}

function getNextRelevantCharge(rows: RentChargeRow[]) {
  const today = new Date().toISOString().slice(0, 10);
  const unpaid = rows.filter((row) => row.balance > 0);
  return (
    unpaid.filter((row) => row.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ??
    unpaid.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ??
    rows.filter((row) => row.balance <= 0).sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0] ??
    null
  );
}

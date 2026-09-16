"use client";

import { DocumentFileActions } from "@/components/DocumentFileActions";
import {
  EmptyTenantState,
  formatDate,
  TenantCard,
  TenantPortalContent,
  TenantStatusBadge,
} from "@/components/tenant-portal/TenantPortalContent";

const documentTypeLabels: Record<string, string> = {
  assurance: "Assurance",
  autre: "Autre",
  avis: "Avis",
  bail: "Bail",
  facture: "Facture",
  inspection: "Inspection",
  paiement: "Paiement",
  photo: "Photo",
  recu: "Reçu",
};

export default function TenantPortalDocumentsPage() {
  return (
    <TenantPortalContent title="Mes documents" description="Documents que votre propriétaire a partagés avec vous.">
      {(snapshot) => {
        const documents = snapshot.documents.filter((document) => document.visibility === "tenant");

        return (
          <TenantCard>
            <h2 className="text-lg font-semibold">Documents partagés</h2>
            <div className="mt-4 grid gap-3">
              {documents.length === 0 ? <EmptyTenantState text="Aucun document n'a encore été partagé dans votre portail." /> : null}
              {documents.map((document) => (
                <article key={document.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{document.name}</h3>
                        <TenantStatusBadge tone="info">{documentTypeLabels[document.type] ?? "Document"}</TenantStatusBadge>
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">Ajouté le {formatDate(document.uploadDate)}</p>
                      {document.notes ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{document.notes}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <DocumentFileActions document={document} />
                    </div>
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

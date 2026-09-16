"use client";

import {
  formatCurrency,
  formatDate,
  TenantCard,
  TenantInfoRow,
  TenantPortalContent,
  TenantStatusBadge,
} from "@/components/tenant-portal/TenantPortalContent";

export default function TenantPortalBailPage() {
  return (
    <TenantPortalContent title="Mon bail" description="Consultez les informations principales de votre bail actif.">
      {(_, context) => (
        <div className="grid gap-4">
          <TenantCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-[var(--muted)]">{context.property?.name ?? "Immeuble"} · {context.unit?.label ?? "Logement"}</p>
                <h2 className="mt-1 text-2xl font-bold">Bail résidentiel</h2>
              </div>
              <TenantStatusBadge tone="success">Actif</TenantStatusBadge>
            </div>
            <div className="mt-5">
              <TenantInfoRow label="Locataire" value={context.tenant ? `${context.tenant.firstName} ${context.tenant.lastName}` : "—"} />
              <TenantInfoRow label="Début prévu" value={formatDate(context.lease?.startDate)} />
              <TenantInfoRow label="Fin prévue" value={formatDate(context.lease?.endDate)} />
              <TenantInfoRow label="Loyer mensuel" value={formatCurrency(context.lease?.monthlyRent ?? 0)} />
              <TenantInfoRow label="Statut" value="Actif" />
            </div>
          </TenantCard>

          <TenantCard>
            <h2 className="text-lg font-semibold">Important</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              La fin d’un bail est gérée par le propriétaire. L’historique du bail, des paiements et des documents reste conservé même après une terminaison.
            </p>
          </TenantCard>
        </div>
      )}
    </TenantPortalContent>
  );
}

"use client";

import {
  formatCurrency,
  TenantCard,
  TenantInfoRow,
  TenantPortalContent,
  TenantStatusBadge,
} from "@/components/tenant-portal/TenantPortalContent";

export default function TenantPortalLogementPage() {
  return (
    <TenantPortalContent title="Mon logement" description="Informations sur le logement associé à votre bail actif.">
      {(_, context) => (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <TenantCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--muted)]">{context.property?.name ?? "Immeuble"}</p>
                <h2 className="mt-1 text-2xl font-bold">{context.unit?.label ?? "Logement"}</h2>
              </div>
              <TenantStatusBadge tone="success">Occupé</TenantStatusBadge>
            </div>
            <div className="mt-5">
              <TenantInfoRow label="Adresse" value={context.property?.address ?? "—"} />
              <TenantInfoRow label="Ville" value={context.property?.city ?? "—"} />
              <TenantInfoRow label="Province" value={context.property?.province ?? "—"} />
              <TenantInfoRow label="Code postal" value={context.property?.postalCode ?? "—"} />
              <TenantInfoRow label="Étage" value={context.unit?.floor || "—"} />
            </div>
          </TenantCard>

          <TenantCard>
            <h2 className="text-lg font-semibold">Loyer</h2>
            <p className="mt-4 text-3xl font-bold">{formatCurrency(context.lease?.monthlyRent ?? 0)}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Montant mensuel prévu au bail</p>
          </TenantCard>
        </div>
      )}
    </TenantPortalContent>
  );
}

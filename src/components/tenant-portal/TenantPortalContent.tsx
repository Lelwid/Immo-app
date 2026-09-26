"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTenantPortalSnapshot } from "@/hooks/useTenantPortalSnapshot";
import type { TenantPortalSnapshot } from "@/lib/data/tenantPortalService";
import type { Lease, MaintenanceTicket, Property, Tenant, Unit } from "@/lib/types";

export type TenantPortalContext = {
  lease: Lease | null;
  property: Property | null;
  tenant: Tenant | null;
  unit: Unit | null;
};

type TenantPortalContentProps = {
  children: (snapshot: TenantPortalSnapshot, context: TenantPortalContext, refresh: () => Promise<TenantPortalSnapshot | null>) => ReactNode;
  description: string;
  title: string;
};

export function TenantPortalContent({ children, description, title }: TenantPortalContentProps) {
  const { data, error, loading, refresh } = useTenantPortalSnapshot();
  const context = useMemo(() => (data ? getTenantPortalContext(data) : emptyContext), [data]);

  if (loading && !data) {
    return (
      <TenantPortalPageHeader title={title} description={description}>
        <div className="grid gap-3">
          <div className="h-28 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
          <div className="h-44 animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
        </div>
      </TenantPortalPageHeader>
    );
  }

  if (error || !data) {
    return (
      <TenantPortalPageHeader title={title} description={description}>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="font-semibold text-[color:var(--red)]">Impossible de charger les données du portail locataire.</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Réessayez dans quelques instants. Si le problème persiste, contactez votre propriétaire.</p>
          <button className="btn-primary mt-4" onClick={() => void refresh()} type="button">
            Réessayer
          </button>
        </section>
      </TenantPortalPageHeader>
    );
  }

  if (!context.tenant || !context.lease) {
    return (
      <TenantPortalPageHeader title={title} description={description}>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="font-semibold text-[var(--foreground)]">Aucun bail actif lié à ce portail.</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Votre accès est bien connecté, mais aucun logement actif n’est disponible pour le moment.
          </p>
        </section>
      </TenantPortalPageHeader>
    );
  }

  return (
    <TenantPortalPageHeader title={title} description={description}>
      {children(data, context, refresh)}
    </TenantPortalPageHeader>
  );
}

export function TenantPortalPageHeader({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <div className="grid gap-5">
      <header>
        <p className="text-sm font-semibold text-[color:var(--accent)]">Portail locataire</p>
        <h1 className="mt-1 break-words text-3xl font-bold tracking-normal text-[var(--foreground)]">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>
      </header>
      {children}
    </div>
  );
}

export function TenantCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function TenantInfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-[var(--border)] py-3 last:border-b-0">
      <span className="shrink-0 text-sm text-[var(--muted)]">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-semibold text-[var(--foreground)]">{value}</span>
    </div>
  );
}

export function TenantStatusBadge({ tone = "neutral", children }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const classes = {
    danger: "border-[color:var(--red)]/35 bg-[color:var(--red)]/10 text-[color:var(--red)]",
    info: "border-[color:var(--accent)]/35 bg-[color:var(--accent)]/10 text-[color:var(--accent)]",
    neutral: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]",
    success: "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[color:var(--green)]",
    warning: "border-[color:var(--yellow)]/35 bg-[color:var(--yellow)]/10 text-[color:var(--yellow)]",
  };

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>{children}</span>;
}

export function EmptyTenantState({ text }: { text: string }) {
  return <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">{text}</p>;
}

export function getTenantPortalContext(snapshot: TenantPortalSnapshot): TenantPortalContext {
  const lease = snapshot.activeLease;
  const tenant = snapshot.activeTenant;

  return {
    lease,
    property: lease ? snapshot.properties.find((property) => property.id === lease.propertyId) ?? null : null,
    tenant,
    unit: lease ? snapshot.units.find((unit) => unit.id === lease.unitId) ?? null : null,
  };
}

export function getTenantAddress(context: TenantPortalContext) {
  const propertyName = context.property?.name ?? "Immeuble";
  const unitName = context.unit?.label ?? "Logement";

  return `${propertyName} · ${unitName}`;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-CA", { currency: "CAD", style: "currency", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(date: string | null | undefined) {
  if (!date) {
    return "—";
  }

  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function statusTone(status: string) {
  if (status === "payé" || status === "resolved") {
    return "success";
  }

  if (status === "en retard" || status === "urgent" || status === "high") {
    return "danger";
  }

  if (status === "partiel" || status === "inProgress" || status === "medium") {
    return "warning";
  }

  return "info";
}

export function ticketStatusLabel(status: MaintenanceTicket["status"]) {
  const labels: Record<MaintenanceTicket["status"], string> = {
    inProgress: "En cours",
    open: "Ouverte",
    resolved: "Résolue",
  };

  return labels[status];
}

export function priorityLabel(priority: MaintenanceTicket["priority"]) {
  const labels: Record<MaintenanceTicket["priority"], string> = {
    high: "Élevée",
    low: "Faible",
    medium: "Moyenne",
    urgent: "Urgente",
  };

  return labels[priority];
}

export function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]" href={href}>
      {label}
    </Link>
  );
}

const emptyContext: TenantPortalContext = {
  lease: null,
  property: null,
  tenant: null,
  unit: null,
};

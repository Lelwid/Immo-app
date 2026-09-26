"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { useAuth } from "@/lib/auth/AuthProvider";

type TenantPortalShellProps = {
  children: ReactNode;
};

type TenantNavItem = {
  href: string;
  icon: IconName;
  label: string;
};

const tenantNavItems: TenantNavItem[] = [
  { href: "/locataire", icon: "layout-dashboard", label: "Accueil" },
  { href: "/locataire/logement", icon: "door-open", label: "Logement" },
  { href: "/locataire/bail", icon: "file-text", label: "Bail" },
  { href: "/locataire/paiements", icon: "credit-card", label: "Paiements" },
  { href: "/locataire/documents", icon: "folder-open", label: "Documents" },
  { href: "/locataire/entretien", icon: "wrench", label: "Entretien" },
];

export function TenantPortalShell({ children }: TenantPortalShellProps) {
  const pathname = usePathname();
  const { signOut, user } = useAuth();

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_34%),var(--background)] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[var(--foreground)] md:pb-0">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:grid md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--border)]/70 bg-[#07101f]/95 px-4 py-5 md:flex md:flex-col">
          <TenantPortalBrand />
          <nav className="mt-8 grid gap-1">
            {tenantNavItems.map((item) => (
              <TenantNavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>
          <div className="mt-auto rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
            <p className="truncate text-sm font-semibold">{user?.email ?? "Accès locataire"}</p>
            <button className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]" onClick={() => void signOut()} type="button">
              Déconnexion
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-[var(--border)]/70 bg-[var(--background)]/92 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-3">
              <TenantPortalBrand compact />
              <button className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]" onClick={() => void signOut()} type="button">
                Quitter
              </button>
            </div>
          </header>

          <section className="page-route-transition px-4 py-5 md:px-6 md:py-7">{children}</section>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[#07101f]/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_42px_rgba(0,0,0,0.35)] md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6 gap-1">
          {tenantNavItems.map((item) => (
            <TenantBottomNavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>
    </main>
  );
}

function TenantPortalBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/locataire" className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
        <Image src="/icons/nexbail-icon-192x192.png" alt="Logo Nexbail" width={40} height={40} className="h-full w-full object-contain" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-base font-bold">Nexbail</span>
        <span className="block truncate text-xs text-[var(--muted)]">{compact ? "Portail locataire" : "Espace locataire"}</span>
      </span>
    </Link>
  );
}

function TenantNavLink({ item, pathname }: { item: TenantNavItem; pathname: string }) {
  const active = isTenantRouteActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-[color:var(--accent)]/14 text-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--accent)]/18" : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]"
      }`}
    >
      <AppIcon name={item.icon} size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

function TenantBottomNavLink({ item, pathname }: { item: TenantNavItem; pathname: string }) {
  const active = isTenantRouteActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      aria-label={item.label}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold transition ${
        active ? "bg-[color:var(--accent)]/16 text-[color:var(--accent)]" : "text-[var(--muted)]"
      }`}
    >
      <AppIcon name={item.icon} size={18} />
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

function isTenantRouteActive(pathname: string, href: string) {
  return pathname === href || (href !== "/locataire" && pathname.startsWith(`${href}/`));
}

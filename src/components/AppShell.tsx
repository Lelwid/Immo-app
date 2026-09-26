"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { HabixaCopilot } from "@/components/HabixaCopilot";

type AppShellProps = {
  children: React.ReactNode;
};

type SidebarItem = {
  badge?: string | null;
  href: string;
  icon: IconName;
  label: string;
};

const SIDEBAR_COLLAPSED_KEY = "habixa:sidebar-collapsed";
const sidebarWidth = "250px";
const sidebarCollapsedWidth = "88px";

const sidebarGroups: { label: string; items: SidebarItem[] }[] = [
  {
    label: "Principal",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: "layout-dashboard" },
      { href: "/immeubles", label: "Immeubles", icon: "building-2" },
      { href: "/locataires", label: "Locataires", icon: "users" },
      { href: "/baux", label: "Baux", icon: "file-text" },
    ],
  },
  {
    label: "Finances",
    items: [
      { href: "/paiements", label: "Paiements", icon: "credit-card" },
      { href: "/finances", label: "Finances", icon: "bar-chart-3" },
    ],
  },
  {
    label: "Opérations",
    items: [
      { href: "/entretien", label: "Entretien", icon: "wrench" },
      { href: "/taches", label: "Tâches", icon: "list-checks" },
      { href: "/calendrier", label: "Calendrier", icon: "calendar-days" },
      { href: "/documents", label: "Documents", icon: "folder-open" },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/feedback", label: "Donner mon avis", icon: "message-circle" },
      { href: "/parametres", label: "Paramètres", icon: "settings" },
    ],
  },
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedPreference = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);

      if (storedPreference === "true" || storedPreference === "false") {
        setSidebarCollapsed(storedPreference === "true");
        return;
      }

      setSidebarCollapsed(window.matchMedia("(max-width: 1180px)").matches);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const nextCollapsed = !collapsed;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextCollapsed));
      return nextCollapsed;
    });
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_32%),var(--background)] text-[var(--foreground)]">
      <div
        className="grid min-h-dvh transition-[grid-template-columns] duration-200 ease-out lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:gap-x-[var(--shell-gap)]"
        style={
          {
            "--sidebar-width": sidebarCollapsed ? sidebarCollapsedWidth : sidebarWidth,
            "--sidebar-collapsed-width": sidebarCollapsedWidth,
            "--shell-gap": sidebarCollapsed ? "0px" : "28px",
          } as CSSProperties
        }
      >
        <AppSidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} pathname={pathname} />
        <div className="min-w-0">
          <AppHeader compact />
          <div key={pathname} className="page-route-transition mx-auto min-w-0 w-full max-w-[1390px] px-4 pb-24 pt-4 sm:px-6 sm:pb-6 lg:px-8">{children}</div>
          <HabixaCopilot />
        </div>
      </div>
    </main>
  );
}

function AppSidebar({ collapsed, onToggleCollapsed, pathname }: { collapsed: boolean; onToggleCollapsed: () => void; pathname: string }) {
  return (
    <aside
      className={`hidden w-[var(--sidebar-width)] max-w-full min-w-0 overflow-x-visible border-r border-[var(--border)]/70 bg-[#07101f]/95 py-5 transition-[padding,width] duration-200 ease-out lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${
        collapsed ? "px-[15px]" : "px-3"
      }`}
    >
      <div className={`relative flex gap-3 ${collapsed ? "-translate-x-2 flex-col items-center" : "items-center justify-between"}`}>
        <Link href="/dashboard" className={`flex min-w-0 items-center rounded-2xl py-1.5 ${collapsed ? "justify-center px-0" : "gap-3 px-2"}`}>
          <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white transition-[height,width] duration-200 ${collapsed ? "h-12 w-12" : "h-11 w-11"}`}>
            <Image src="/icons/nexbail-icon-192x192.png" alt="Logo Nexbail" width={44} height={44} className="h-full w-full object-contain" />
          </span>
          <span
            className={`min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-200 ${
              collapsed ? "hidden" : "max-w-[150px] translate-x-0 opacity-100"
            }`}
          >
            <span className="block truncate text-xl font-bold tracking-normal">Nexbail</span>
            <span className="block truncate text-xs text-[var(--muted)]">Gestionnaire Immo</span>
          </span>
        </Link>

        <button
          aria-label={collapsed ? "Ouvrir la sidebar" : "Réduire la sidebar"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-white/[0.03] text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)]"
          onClick={onToggleCollapsed}
          title={collapsed ? "Ouvrir" : "Réduire"}
          type="button"
        >
          <AppIcon name={collapsed ? "panel-left-open" : "panel-left-close"} size={17} />
        </button>
      </div>

      <nav className={`custom-scrollbar min-h-0 flex-1 ${collapsed ? "-mx-[15px] mt-6 w-[var(--sidebar-collapsed-width)] overflow-visible" : "mt-8 overflow-y-auto pr-1"}`}>
        <div className={collapsed ? "grid w-full justify-items-center gap-3.5" : "grid gap-7"}>
          {sidebarGroups.map((group) => (
            <div key={group.label} className={collapsed ? "w-full" : undefined}>
              <p
                className={`px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] transition-[height,opacity] duration-200 ${
                  collapsed ? "h-0 overflow-hidden opacity-0" : "h-4 opacity-100"
                }`}
              >
                {group.label}
              </p>
              <div className={collapsed ? "mt-0 grid w-full justify-items-center gap-1.5" : "mt-2 grid gap-1"}>
                {group.items.map((item) => {
                  const active = isSidebarItemActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      aria-label={item.label}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group/sidebar-item relative min-w-0 rounded-xl text-sm font-semibold transition ${
                        collapsed ? "mx-auto flex h-14 w-14 items-center justify-center px-0 py-0" : "flex min-h-[42px] items-center gap-3 px-3 py-2.5"
                      } ${
                        active
                          ? "bg-[color:var(--accent)]/14 text-[color:var(--accent)] ring-1 ring-inset ring-[color:var(--accent)]/18"
                          : "text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <AppIcon name={item.icon} size={collapsed ? 19 : 18} />
                      </span>
                      <span
                        className={`truncate transition-[max-width,opacity,transform] duration-200 ${
                          collapsed ? "hidden" : "max-w-[150px] translate-x-0 opacity-100"
                        }`}
                      >
                        {item.label}
                      </span>
                      {item.badge && !collapsed ? (
                        <span className="ml-auto rounded-lg bg-[color:var(--accent)]/20 px-2 py-0.5 text-xs font-bold text-[color:var(--accent)]">
                          {item.badge}
                        </span>
                      ) : null}
                      {collapsed ? (
                        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--foreground)] opacity-0 shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition group-hover/sidebar-item:opacity-100 group-focus-visible/sidebar-item:opacity-100">
                          {item.label}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div
        className={`mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-white/[0.03] transition-[max-height,opacity,padding] duration-200 ${
          collapsed ? "max-h-0 p-0 opacity-0" : "max-h-40 p-3 opacity-100"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Plan Pro</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Portefeuille actif</p>
          </div>
          <span className="text-[var(--muted)]">&gt;</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div className="h-full w-2/5 rounded-full bg-[color:var(--accent)]" />
        </div>
      </div>
    </aside>
  );
}

function isSidebarItemActive(pathname: string, href: string) {
  if (href.includes("#")) {
    return false;
  }

  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

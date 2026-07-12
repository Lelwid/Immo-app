"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationList } from "@/components/NotificationList";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DATA_MODE_KEY, setDataMode, type DataMode } from "@/lib/data/dataMode";
import { getNotificationItems } from "@/lib/mockData";
import { getGlobalSearchResults } from "@/lib/search";

type Theme = "light" | "dark";

type NavLink = {
  href: string;
  label: string;
  badge?: number;
};

type DropdownId = "portefeuille" | "finances" | "operations";

type NavGroup = {
  id: string;
  label: string;
  href?: string;
  routes: string[];
  items?: NavLink[];
};

const navGroups: NavGroup[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "Tableau de bord",
    routes: ["/dashboard"],
  },
  {
    id: "portefeuille",
    label: "Portefeuille",
    routes: ["/immeubles", "/locataires"],
    items: [
      { href: "/immeubles", label: "Immeubles" },
      { href: "/locataires", label: "Locataires" },
    ],
  },
  {
    id: "finances",
    label: "Finances",
    routes: ["/finances", "/paiements", "/baux"],
    items: [
      { href: "/finances", label: "Vue financière" },
      { href: "/paiements", label: "Paiements" },
      { href: "/baux", label: "Baux" },
    ],
  },
  {
    id: "operations",
    label: "Opérations",
    routes: ["/entretien", "/taches", "/calendrier", "/activites"],
    items: [
      { href: "/entretien", label: "Demandes d'entretien" },
      { href: "/taches", label: "Mes tâches" },
      { href: "/calendrier", label: "Calendrier" },
      { href: "/activites", label: "Journal d'activité" },
    ],
  },
  {
    id: "documents",
    href: "/documents",
    label: "Documents",
    routes: ["/documents"],
  },
];

export function AppHeader() {
  const pathname = usePathname();
  const { configured, signOut, user } = useAuth();
  const { data: snapshotStore, refresh: refreshPortfolioSnapshot } = usePortfolioSnapshot();
  const headerRef = useRef<HTMLElement>(null);
  const dropdownCloseTimerRef = useRef<number | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [dataModeState, setDataModeState] = useState<DataMode>("local");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<DropdownId | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const notifications = useMemo(() => getNotificationItems(snapshotStore), [snapshotStore]);
  const openTaskCount = snapshotStore.tasks.filter((task) => !task.completed).length;
  const searchResults = useMemo(() => getGlobalSearchResults(snapshotStore, searchQuery), [searchQuery, snapshotStore]);
  const urgentCount = notifications.filter((notification) => notification.priority === "urgent").length;
  const attentionCount = notifications.filter((notification) => notification.priority === "attention").length;
  const navigationGroups = useMemo(
    () =>
      navGroups.map((group) =>
        group.id === "operations"
          ? {
              ...group,
              items: group.items?.map((item) => (item.href === "/taches" ? { ...item, badge: openTaskCount } : item)),
            }
          : group,
      ),
    [openTaskCount],
  );
  const badgeClass =
    urgentCount > 0
      ? "bg-[color:var(--red)] text-white"
      : attentionCount > 0
        ? "bg-[color:var(--yellow)] text-[#111827]"
        : "bg-[var(--surface-3)] text-[var(--muted)]";

  useEffect(() => {
    const searchTheme = new URLSearchParams(window.location.search).get("theme");
    const storedTheme = window.localStorage.getItem("theme");
    const nextTheme = searchTheme === "light" || searchTheme === "dark" ? searchTheme : storedTheme;
    const storedDataMode = window.localStorage.getItem(DATA_MODE_KEY) === "supabase" ? "supabase" : "local";

    const dataModeTimer = window.setTimeout(() => setDataModeState(storedDataMode), 0);
    if (nextTheme !== "light" && nextTheme !== "dark") {
      return () => window.clearTimeout(dataModeTimer);
    }

    const themeTimer = window.setTimeout(() => setTheme(nextTheme), 0);
    return () => {
      window.clearTimeout(dataModeTimer);
      window.clearTimeout(themeTimer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (dropdownCloseTimerRef.current) {
        window.clearTimeout(dropdownCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setNotificationsOpen(false);
        setSettingsOpen(false);
        setActiveDropdown(null);
        setMobileMenuOpen(false);
        void refreshPortfolioSnapshot();
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setSettingsOpen(false);
        setActiveDropdown(null);
        setMobileMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [refreshPortfolioSnapshot]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActiveDropdown(null);
      setMobileMenuOpen(false);
      setNotificationsOpen(false);
      setSettingsOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setActiveDropdown(null);
        setMobileMenuOpen(false);
        setNotificationsOpen(false);
        setSettingsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleTheme() {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      window.localStorage.setItem("theme", nextTheme);
      return nextTheme;
    });
  }

  async function updateDataMode(mode: DataMode) {
    setDataMode(mode);
    setDataModeState(mode);
    try {
      await refreshPortfolioSnapshot();
    } catch (error) {
      console.error("Impossible de rafraîchir les données du header.", error);
      void error;
    }
  }

  async function handleSignOut() {
    setSettingsOpen(false);
    await signOut();
  }

  function cancelDropdownClose() {
    if (dropdownCloseTimerRef.current) {
      window.clearTimeout(dropdownCloseTimerRef.current);
      dropdownCloseTimerRef.current = null;
    }
  }

  function openDropdown(id: DropdownId) {
    cancelDropdownClose();
    setActiveDropdown(id);
    setNotificationsOpen(false);
    setSettingsOpen(false);
  }

  function closeDropdown() {
    cancelDropdownClose();
    setActiveDropdown(null);
  }

  function scheduleDropdownClose() {
    cancelDropdownClose();
    dropdownCloseTimerRef.current = window.setTimeout(() => {
      setActiveDropdown(null);
      dropdownCloseTimerRef.current = null;
    }, 200);
  }

  return (
    <nav
      ref={headerRef}
      className="relative flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4"
    >
      <Link href="/dashboard" className="flex shrink-0 items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-sm font-bold text-[color:var(--accent)]">
          GI
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold leading-tight text-[var(--foreground)]">Gestionnaire Immo</p>
          <p className="truncate text-xs leading-tight text-[var(--muted)]">Portefeuille investisseurs</p>
        </div>
      </Link>

      <div className="hidden shrink-0 items-center gap-1 text-sm font-medium text-[var(--muted)] xl:flex">
        {navigationGroups.map((group) => (
          <DesktopNavItem
            key={group.id}
            group={group}
            active={isGroupActive(pathname, group)}
            open={activeDropdown === group.id}
            pathname={pathname}
            onOpen={() => {
              if (isDropdownGroup(group)) {
                openDropdown(group.id);
              }
            }}
            onClose={scheduleDropdownClose}
            onCloseNow={closeDropdown}
            onToggle={() => {
              cancelDropdownClose();
              setActiveDropdown((current) => (current === group.id ? null : isDropdownGroup(group) ? group.id : null));
              setNotificationsOpen(false);
              setSettingsOpen(false);
            }}
          />
        ))}
      </div>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
        <button
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-label="Ouvrir la navigation"
          onClick={() => {
            setMobileMenuOpen((open) => !open);
            setActiveDropdown(null);
            setNotificationsOpen(false);
            setSettingsOpen(false);
            setSearchOpen(false);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)] xl:hidden"
        >
          <MenuIcon />
        </button>
        <button
          type="button"
          aria-label="Rechercher"
          onClick={() => {
            setSearchOpen(true);
            setNotificationsOpen(false);
            setSettingsOpen(false);
            setActiveDropdown(null);
            setMobileMenuOpen(false);
            void refreshPortfolioSnapshot();
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)] md:hidden"
        >
          <SearchIcon />
        </button>
        <button
          type="button"
          onClick={() => {
            setSearchOpen(true);
            setNotificationsOpen(false);
            setSettingsOpen(false);
            setActiveDropdown(null);
            setMobileMenuOpen(false);
            void refreshPortfolioSnapshot();
          }}
          className="hidden min-w-[160px] max-w-[260px] flex-[1_1_220px] items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1.5 text-left text-xs font-medium text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)] md:flex"
        >
          <span className="truncate">Rechercher...</span>
          <span className="hidden shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] sm:inline">Ctrl K</span>
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => {
              setNotificationsOpen((open) => {
                const nextOpen = !open;
                if (nextOpen) {
                  void refreshPortfolioSnapshot();
                }
                return nextOpen;
              });
              setActiveDropdown(null);
              setMobileMenuOpen(false);
              setSettingsOpen(false);
            }}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)]"
          >
            <BellIcon />
            {notifications.length > 0 ? (
              <span className={`absolute -right-1 -top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${badgeClass}`}>
                {notifications.length}
              </span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="custom-scrollbar absolute right-0 top-10 z-50 max-h-[70vh] w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <div>
                  <h2 className="font-semibold text-[var(--foreground)]">Notifications</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{notifications.length} notifications actives</p>
                </div>
                <Link href="/notifications" onClick={() => setNotificationsOpen(false)} className="text-xs font-semibold text-[color:var(--accent)] hover:underline">
                  Tout voir
                </Link>
              </div>
              <NotificationList notifications={notifications.slice(0, 5)} compact />
              <Link
                href="/notifications"
                onClick={() => setNotificationsOpen(false)}
                className="mt-3 flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]"
              >
                Voir toutes les notifications
              </Link>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
          title={theme === "dark" ? "Clair" : "Sombre"}
          onClick={toggleTheme}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)]"
        >
          <ThemeIcon theme={theme} />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-expanded={settingsOpen}
            aria-label="Ouvrir les paramètres"
            onClick={() => {
              setSettingsOpen((open) => !open);
              setNotificationsOpen(false);
              setActiveDropdown(null);
              setMobileMenuOpen(false);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] text-[var(--muted)] transition hover:border-[color:var(--accent)]/60 hover:text-[var(--foreground)]"
          >
            {user ? (
              <span className="text-xs font-bold text-[var(--foreground)]">{getUserInitial(user.email)}</span>
            ) : (
              <SettingsIcon />
            )}
          </button>

          {settingsOpen ? (
            <div className="absolute right-0 top-10 z-50 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
              <div className="border-b border-[var(--border)] pb-3">
                <p className="text-sm font-semibold text-[var(--foreground)]">Paramètres</p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">
                  {user?.email ?? "Accès démo local"}
                </p>
              </div>

              <div className="grid gap-3 py-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[var(--muted)]">Mode de données</span>
                  <select
                    className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] outline-none"
                    title={!configured ? "Supabase n'est pas encore configuré. Le fallback local restera actif." : undefined}
                    value={dataModeState}
                    onChange={(event) => updateDataMode(event.target.value as DataMode)}
                  >
                    <option value="local">Démo local</option>
                    <option value="supabase">Supabase</option>
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <InfoTile label="Région" value="Québec" />
                  <InfoTile label="Devise" value="CAD" />
                </div>

                <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
                  <p className="text-xs font-semibold text-[var(--muted)]">Info dev</p>
                  <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                    {configured ? "Supabase configuré" : "Supabase non configuré"}
                  </p>
                </div>
              </div>

              <button
                className="flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[color:var(--accent)]/60 hover:text-[color:var(--accent)]"
                onClick={handleSignOut}
                type="button"
              >
                Déconnexion
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="custom-scrollbar absolute left-3 right-3 top-[calc(100%+0.5rem)] z-50 max-h-[80vh] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.35)] xl:hidden">
          <MobileNavigation groups={navigationGroups} pathname={pathname} onNavigate={() => setMobileMenuOpen(false)} />
        </div>
      ) : null}

      {searchOpen ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 py-20">
          <div className="w-full max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
            <div className="border-b border-[var(--border)] p-3">
              <label className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                <SearchIcon />
                <input
                  autoFocus
                  className="w-full bg-transparent text-sm font-medium text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]"
                >
                  Esc
                </button>
              </label>
            </div>

            <div className="custom-scrollbar max-h-[60vh] overflow-y-auto p-3">
              {searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  <div className="grid gap-2">
                    {searchResults.map((result) => (
                      <a
                        key={result.id}
                        href={result.href}
                        onClick={() => setSearchOpen(false)}
                        className="group block rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 transition hover:border-[color:var(--accent)]/60 hover:bg-[var(--surface-3)]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--accent)]">
                            {result.type}
                          </span>
                          <span className="text-xs font-medium text-[var(--muted)]">{result.context}</span>
                        </div>
                        <h3 className="mt-2 font-semibold text-[var(--foreground)] transition group-hover:text-[color:var(--accent)]">
                          {result.title}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--muted)]">{result.subtitle}</p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                    Aucun résultat trouvé.
                  </p>
                )
              ) : (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                  Recherchez un immeuble, un logement, un locataire, un bail, un paiement, une demande d&apos;entretien, un document ou une activité.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}

function DesktopNavItem({
  active,
  group,
  open,
  pathname,
  onClose,
  onCloseNow,
  onOpen,
  onToggle,
}: {
  active: boolean;
  group: NavGroup;
  open: boolean;
  pathname: string;
  onClose: () => void;
  onCloseNow: () => void;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const baseClass = `rounded-md px-3 py-1.5 transition ${
    active ? "bg-[var(--surface-3)] text-[var(--foreground)]" : "hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
  }`;

  if (!group.items && group.href) {
    return (
      <Link href={group.href} className={baseClass}>
        {group.label}
      </Link>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
          onClose();
        }
      }}
      onFocus={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCloseNow();
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          onOpen();
          window.setTimeout(() => {
            wrapperRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
          }, 0);
        }
      }}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
        className={`${baseClass} flex items-center gap-1`}
      >
        <span>{group.label}</span>
        <ChevronDownIcon />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 w-56 pt-2">
          <div className="grid gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.32)]">
            {group.items?.map((item) => (
              <NavSubLink key={item.href} item={item} active={isRouteActive(pathname, item.href)} onNavigate={onCloseNow} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileNavigation({ groups, pathname, onNavigate }: { groups: NavGroup[]; pathname: string; onNavigate: () => void }) {
  return (
    <div className="grid gap-3">
      {groups.map((group) => {
        const active = isGroupActive(pathname, group);

        if (!group.items && group.href) {
          return (
            <Link
              key={group.id}
              href={group.href}
              onClick={onNavigate}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                active ? "bg-[var(--surface-3)] text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
            >
              {group.label}
            </Link>
          );
        }

        return (
          <section key={group.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
            <p className={`px-2 pb-2 text-xs font-bold uppercase tracking-[0.12em] ${active ? "text-[color:var(--accent)]" : "text-[var(--muted)]"}`}>
              {group.label}
            </p>
            <div className="grid gap-1">
              {group.items?.map((item) => (
                <NavSubLink key={item.href} item={item} active={isRouteActive(pathname, item.href)} onNavigate={onNavigate} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NavSubLink({ active, item, onNavigate }: { active: boolean; item: NavLink; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-[var(--surface-3)] text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
      }`}
    >
      <span>{item.label}</span>
      {item.badge && item.badge > 0 ? (
        <span className="rounded-full bg-[color:var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
      ) : null}
    </Link>
  );
}

function isGroupActive(pathname: string, group: NavGroup) {
  return group.routes.some((route) => isRouteActive(pathname, route));
}

function isDropdownGroup(group: NavGroup): group is NavGroup & { id: DropdownId; items: NavLink[] } {
  return (group.id === "portefeuille" || group.id === "finances" || group.id === "operations") && Boolean(group.items);
}

function isRouteActive(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function getUserInitial(email?: string) {
  return (email?.trim().charAt(0) || "U").toUpperCase();
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <p className="text-xs font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "dark") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-[var(--muted)]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

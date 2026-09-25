"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { DEMO_AUTH_KEY, useAuth } from "@/lib/auth/AuthProvider";
import { getDataMode } from "@/lib/data/dataMode";
import { hasActiveTenantPortalAccount } from "@/lib/data/tenantPortalService";
import { STORAGE_KEY } from "@/lib/local-storage";
import { ONBOARDING_KEY, ONBOARDING_TRANSITION_KEY, shouldRequireOnboarding } from "@/lib/onboardingDecision";

const publicRoutes = new Set(["/connexion", "/inscription", "/mot-de-passe-oublie", "/onboarding", "/auth/callback", "/confidentialite", "/conditions"]);
const protectedPrefixes = [
  "/dashboard",
  "/immeubles",
  "/baux",
  "/paiements",
  "/finances",
  "/documents",
  "/calendrier",
  "/activites",
  "/taches",
  "/entretien",
  "/locataires",
  "/notifications",
  "/parametres",
  "/feedback",
];

export function AuthRouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const redirectTargetRef = useRef<string | null>(null);
  const [tenantRoleCheck, setTenantRoleCheck] = useState<{
    key: string;
    role: "owner" | "tenant" | "error";
  }>({ key: "", role: "owner" });
  const { configured, loading, user } = useAuth();
  const isPublic = publicRoutes.has(pathname);
  const isTenantPortal = pathname === "/locataire" || pathname.startsWith("/locataire/");
  const isOnboarding = pathname === "/onboarding";
  const isSignInRoute = pathname === "/connexion" || pathname === "/inscription";
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isTenantProtected = isTenantPortal;
  const isTenantInvitation = pathname === "/locataire/invitation";
  const dataMode = typeof window !== "undefined" ? getDataMode() : "local";
  const onboardingTransitionActive =
    typeof window !== "undefined" && Boolean(window.sessionStorage.getItem(ONBOARDING_TRANSITION_KEY));
  const demoAccess = !configured && typeof window !== "undefined" && window.localStorage.getItem(DEMO_AUTH_KEY) === "true";
  const authenticated = Boolean(user) || demoAccess;
  const shouldCheckTenantRole = configured && Boolean(user) && dataMode === "supabase" && (isProtected || (isTenantPortal && !isTenantInvitation));
  const tenantRoleCheckKey = shouldCheckTenantRole ? `${user?.id ?? ""}:${pathname}` : "";
  const tenantRole = !shouldCheckTenantRole
    ? "idle"
    : tenantRoleCheck.key === tenantRoleCheckKey
      ? tenantRoleCheck.role
      : "loading";
  const shouldCheckSupabasePortfolio =
    configured &&
    Boolean(user) &&
    dataMode === "supabase" &&
    !isTenantPortal &&
    (isProtected || isSignInRoute || isOnboarding);
  const {
    data,
    error: portfolioError,
    loading: portfolioLoading,
    refresh: retryPortfolioCheck,
    snapshot,
  } = usePortfolioSnapshot({ enabled: shouldCheckSupabasePortfolio });
  const portfolioData = data ?? emptyPortfolioStore;
  const decision = shouldRequireOnboarding({
    authenticated,
    authLoaded: !loading,
    dataMode,
    isOnboardingRoute: isOnboarding,
    isProtectedRoute: isProtected,
    isSignInRoute,
    localOnboardingState: typeof window !== "undefined" ? window.localStorage.getItem(ONBOARDING_KEY) : null,
    localStoreExists: typeof window !== "undefined" ? Boolean(window.localStorage.getItem(STORAGE_KEY)) : false,
    onboardingTransitionActive,
    pathname,
    portfolioError: Boolean(portfolioError),
    portfolioLoaded: !shouldCheckSupabasePortfolio || Boolean(snapshot),
    propertyCount: portfolioData.properties.length,
    supabaseConfigured: configured,
  });

  useEffect(() => {
    let cancelled = false;

    if (!shouldCheckTenantRole) {
      return () => {
        cancelled = true;
      };
    }

    void hasActiveTenantPortalAccount()
      .then((isTenant) => {
        if (!cancelled) {
          setTenantRoleCheck({ key: tenantRoleCheckKey, role: isTenant ? "tenant" : "owner" });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTenantRoleCheck({ key: tenantRoleCheckKey, role: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldCheckTenantRole, tenantRoleCheckKey]);

  useEffect(() => {
    if (isTenantProtected && !loading && !authenticated) {
      const query = window.location.search.replace(/^\?/, "");
      const currentPath = query ? `${pathname}?${query}` : pathname;
      const nextTarget = `/connexion?redirect=${encodeURIComponent(currentPath)}`;

      if (redirectTargetRef.current !== nextTarget) {
        redirectTargetRef.current = nextTarget;
        router.replace(nextTarget);
      }

      return;
    }

    if (!loading && authenticated && tenantRole === "tenant" && isProtected) {
      if (redirectTargetRef.current !== "/locataire") {
        redirectTargetRef.current = "/locataire";
        router.replace("/locataire");
      }

      return;
    }

    if (!loading && authenticated && tenantRole === "owner" && isTenantPortal && !isTenantInvitation) {
      if (redirectTargetRef.current !== "/dashboard") {
        redirectTargetRef.current = "/dashboard";
        router.replace("/dashboard");
      }

      return;
    }

    debugOnboardingDecision({
      decision,
      onboardingTransitionActive,
      pathname,
      propertyCount: portfolioData.properties.length,
      redirectTarget: redirectTargetRef.current,
      shouldCheckSupabasePortfolio,
    });

    if (onboardingTransitionActive && portfolioData.properties.length > 0) {
      window.sessionStorage.removeItem(ONBOARDING_TRANSITION_KEY);
    }

    if (decision.status !== "redirect" || pathname === decision.to) {
      if (decision.status !== "redirect") {
        redirectTargetRef.current = null;
      }
      return;
    }

    if (redirectTargetRef.current === decision.to) {
      return;
    }

    redirectTargetRef.current = decision.to;
    router.replace(decision.to);
  }, [authenticated, decision, isProtected, isTenantInvitation, isTenantPortal, isTenantProtected, loading, onboardingTransitionActive, pathname, portfolioData.properties.length, router, shouldCheckSupabasePortfolio, tenantRole]);

  if ((isTenantProtected && loading) || tenantRole === "loading" || (decision.status === "loading" && !isPublic) || (shouldCheckSupabasePortfolio && portfolioLoading)) {
    const loadingContent = (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="grid gap-3">
          <div className="h-4 w-48 animate-pulse rounded-full bg-[var(--surface-3)]" />
          <div className="h-8 w-full max-w-lg animate-pulse rounded-md bg-[var(--surface-3)]" />
          <p className="text-sm text-[var(--muted)]">Vérification de votre portefeuille...</p>
        </div>
      </div>
    );

    if (isProtected && authenticated && !isOnboarding) {
      return <AppShell>{loadingContent}</AppShell>;
    }

    return (
      <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">
        <div className="mx-auto max-w-7xl">{loadingContent}</div>
      </main>
    );
  }

  if (tenantRole === "error") {
    return (
      <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">
        <section className="mx-auto max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-semibold text-[color:var(--red)]">Impossible de vérifier votre type d’accès.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">Actualisez la page dans quelques instants.</p>
        </section>
      </main>
    );
  }

  if (decision.status === "error") {
    const errorContent = (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[color:var(--red)]">Impossible de vérifier votre portefeuille.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Réessayez dans quelques instants. Si le problème persiste, vérifiez la configuration Supabase.
          </p>
          <button className="btn-primary mt-4" onClick={() => void retryPortfolioCheck()} type="button">
            Réessayer
          </button>
        </div>
      </section>
    );

    if (isProtected && authenticated && !isOnboarding) {
      return <AppShell>{errorContent}</AppShell>;
    }

    return (
      <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">
        <div className="mx-auto max-w-2xl">{errorContent}</div>
      </main>
    );
  }

  if (decision.status === "redirect") {
    return null;
  }

  if ((tenantRole === "tenant" && isProtected) || (tenantRole === "owner" && isTenantPortal && !isTenantInvitation)) {
    return null;
  }

  if (isTenantPortal) {
    if (!authenticated) {
      return null;
    }

    return <>{children}</>;
  }

  return isProtected ? <AppShell>{children}</AppShell> : <>{children}</>;
}

function debugOnboardingDecision(details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[onboarding-gate]", details);
}

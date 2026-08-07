"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { emptyPortfolioStore, usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { DEMO_AUTH_KEY, useAuth } from "@/lib/auth/AuthProvider";
import { getDataMode } from "@/lib/data/dataMode";
import { STORAGE_KEY } from "@/lib/local-storage";
import { ONBOARDING_KEY, ONBOARDING_TRANSITION_KEY, shouldRequireOnboarding } from "@/lib/onboardingDecision";

const publicRoutes = new Set(["/connexion", "/inscription", "/mot-de-passe-oublie", "/onboarding"]);
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
];

export function AuthRouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const redirectTargetRef = useRef<string | null>(null);
  const { configured, loading, user } = useAuth();
  const isPublic = publicRoutes.has(pathname);
  const isOnboarding = pathname === "/onboarding";
  const isSignInRoute = pathname === "/connexion" || pathname === "/inscription";
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const dataMode = typeof window !== "undefined" ? getDataMode() : "local";
  const onboardingTransitionActive =
    typeof window !== "undefined" && Boolean(window.sessionStorage.getItem(ONBOARDING_TRANSITION_KEY));
  const demoAccess = !configured && typeof window !== "undefined" && window.localStorage.getItem(DEMO_AUTH_KEY) === "true";
  const authenticated = Boolean(user) || demoAccess;
  const shouldCheckSupabasePortfolio =
    configured &&
    Boolean(user) &&
    dataMode === "supabase" &&
    !isOnboarding &&
    (isProtected || isSignInRoute);
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
  }, [decision, onboardingTransitionActive, pathname, portfolioData.properties.length, router, shouldCheckSupabasePortfolio]);

  if ((decision.status === "loading" && !isPublic) || (shouldCheckSupabasePortfolio && portfolioLoading)) {
    return (
      <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">
        <div className="mx-auto grid max-w-7xl gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="h-4 w-48 animate-pulse rounded-full bg-[var(--surface-3)]" />
          <div className="h-8 w-full max-w-lg animate-pulse rounded-md bg-[var(--surface-3)]" />
          <p className="text-sm text-[var(--muted)]">Vérification de votre portefeuille...</p>
        </div>
      </main>
    );
  }

  if (decision.status === "error") {
    return (
      <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">
        <section className="mx-auto max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-sm font-semibold text-[color:var(--red)]">Impossible de vérifier votre portefeuille.</p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Réessayez dans quelques instants. Si le problème persiste, vérifiez la configuration Supabase.
          </p>
          <button className="btn-primary mt-4" onClick={() => void retryPortfolioCheck()} type="button">
            Réessayer
          </button>
        </section>
      </main>
    );
  }

  if (decision.status === "redirect") {
    return null;
  }

  return <>{children}</>;
}

function debugOnboardingDecision(details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug("[onboarding-gate]", details);
}

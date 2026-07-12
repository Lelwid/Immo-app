"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DEMO_AUTH_KEY, useAuth } from "@/lib/auth/AuthProvider";

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
  const { configured, loading, user } = useAuth();
  const isPublic = publicRoutes.has(pathname);
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const demoAccess = !configured && typeof window !== "undefined" && window.localStorage.getItem(DEMO_AUTH_KEY) === "true";
  const authenticated = Boolean(user) || demoAccess;
  const shouldRedirectToLogin = !loading && !authenticated && isProtected;
  const shouldRedirectToDashboard = !loading && user && (pathname === "/connexion" || pathname === "/inscription");

  useEffect(() => {
    if (shouldRedirectToLogin) {
      router.replace("/connexion");
    }

    if (shouldRedirectToDashboard) {
      router.replace("/dashboard");
    }
  }, [router, shouldRedirectToDashboard, shouldRedirectToLogin]);

  if (loading && !isPublic) {
    return (
      <main className="min-h-screen bg-[var(--background)] p-6 text-[var(--foreground)]">
        <div className="mx-auto h-32 max-w-7xl animate-pulse rounded-lg border border-[var(--border)] bg-[var(--surface)]" />
      </main>
    );
  }

  if (shouldRedirectToLogin || shouldRedirectToDashboard) {
    return null;
  }

  return <>{children}</>;
}

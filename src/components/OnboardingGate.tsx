"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { STORAGE_KEY } from "@/lib/local-storage";

export const ONBOARDING_KEY = "gestionnaire-immo-onboarding-v1";
const onboardingPublicRoutes = new Set(["/connexion", "/inscription", "/mot-de-passe-oublie", "/onboarding"]);

export function OnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const shouldCheck = !onboardingPublicRoutes.has(pathname);
  const shouldRedirect =
    typeof window !== "undefined" &&
    shouldCheck &&
    !window.localStorage.getItem(STORAGE_KEY) &&
    !window.localStorage.getItem(ONBOARDING_KEY);

  useEffect(() => {
    if (shouldRedirect) {
      router.replace("/onboarding");
    }
  }, [router, shouldRedirect]);

  if (typeof window === "undefined" || shouldRedirect) {
    return null;
  }

  return <>{children}</>;
}

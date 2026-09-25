import type { DataMode } from "@/lib/data/dataMode";

export const ONBOARDING_KEY = "gestionnaire-immo-onboarding-v1";
export const ONBOARDING_TRANSITION_KEY = "immo:onboarding-transition";

export type OnboardingDecisionInput = {
  authenticated: boolean;
  authLoaded: boolean;
  dataMode: DataMode;
  isOnboardingRoute: boolean;
  isProtectedRoute: boolean;
  isSignInRoute: boolean;
  localOnboardingState: string | null;
  localStoreExists: boolean;
  onboardingTransitionActive: boolean;
  pathname: string;
  portfolioError: boolean;
  portfolioLoaded: boolean;
  propertyCount: number;
  supabaseConfigured: boolean;
};

export type OnboardingDecision =
  | { status: "allow"; reason: string }
  | { status: "error"; reason: string }
  | { status: "loading"; reason: string }
  | { status: "redirect"; reason: string; to: "/connexion" | "/dashboard" | "/onboarding" };

export function shouldRequireOnboarding(input: OnboardingDecisionInput): OnboardingDecision {
  if (!input.authLoaded && !input.isSignInRoute && !input.isOnboardingRoute) {
    return { status: "loading", reason: "auth-loading" };
  }

  if (!input.authenticated && input.isProtectedRoute) {
    return { status: "redirect", reason: "auth-required", to: "/connexion" };
  }

  if (input.dataMode === "supabase" && input.supabaseConfigured && input.authenticated) {
    return getSupabaseOnboardingDecision(input);
  }

  return getLocalOnboardingDecision(input);
}

function getSupabaseOnboardingDecision(input: OnboardingDecisionInput): OnboardingDecision {
  if (!input.isProtectedRoute && !input.isSignInRoute && !input.isOnboardingRoute) {
    return { status: "allow", reason: "supabase-public-route" };
  }

  if (input.onboardingTransitionActive && input.propertyCount === 0) {
    return { status: "loading", reason: "supabase-onboarding-transition" };
  }

  if (!input.portfolioLoaded) {
    return { status: "loading", reason: "portfolio-loading" };
  }

  if (input.portfolioError) {
    return { status: "error", reason: "portfolio-error" };
  }

  if (input.propertyCount === 0) {
    if (input.isOnboardingRoute) {
      return { status: "allow", reason: "supabase-onboarding-needed-current-route" };
    }

    return { status: "redirect", reason: "supabase-empty-portfolio", to: "/onboarding" };
  }

  if (input.isSignInRoute) {
    return { status: "redirect", reason: "supabase-authenticated-with-portfolio", to: "/dashboard" };
  }

  if (input.isOnboardingRoute) {
    return { status: "redirect", reason: "supabase-onboarding-already-complete", to: "/dashboard" };
  }

  return { status: "allow", reason: "supabase-portfolio-ready" };
}

function getLocalOnboardingDecision(input: OnboardingDecisionInput): OnboardingDecision {
  if (input.isOnboardingRoute || input.isSignInRoute) {
    return { status: "allow", reason: "local-public-route" };
  }

  if (!input.isProtectedRoute) {
    return { status: "allow", reason: "local-unprotected-route" };
  }

  if (!input.localStoreExists && !input.localOnboardingState) {
    return { status: "redirect", reason: "local-onboarding-needed", to: "/onboarding" };
  }

  return { status: "allow", reason: "local-onboarding-complete-or-skipped" };
}

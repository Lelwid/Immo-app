import assert from "node:assert/strict";
import test from "node:test";

import { shouldRequireOnboarding, type OnboardingDecisionInput } from "@/lib/onboardingDecision";

const authenticatedSupabaseInput: OnboardingDecisionInput = {
  authenticated: true,
  authLoaded: true,
  dataMode: "supabase",
  isOnboardingRoute: false,
  isProtectedRoute: true,
  isSignInRoute: false,
  localOnboardingState: null,
  localStoreExists: false,
  onboardingTransitionActive: false,
  pathname: "/dashboard",
  portfolioError: false,
  portfolioLoaded: false,
  propertyCount: 0,
  supabaseConfigured: true,
};

test("reports a portfolio failure instead of leaving the route gate loading", () => {
  const decision = shouldRequireOnboarding({
    ...authenticatedSupabaseInput,
    portfolioError: true,
  });

  assert.deepEqual(decision, { status: "error", reason: "portfolio-error" });
});

test("keeps waiting while the initial portfolio request is pending", () => {
  const decision = shouldRequireOnboarding(authenticatedSupabaseInput);

  assert.deepEqual(decision, { status: "loading", reason: "portfolio-loading" });
});

test("sends an authenticated owner without a portfolio to onboarding", () => {
  const decision = shouldRequireOnboarding({
    ...authenticatedSupabaseInput,
    portfolioLoaded: true,
  });

  assert.deepEqual(decision, { status: "redirect", reason: "supabase-empty-portfolio", to: "/onboarding" });
});

test("allows an authenticated owner with a portfolio into the dashboard", () => {
  const decision = shouldRequireOnboarding({
    ...authenticatedSupabaseInput,
    portfolioLoaded: true,
    propertyCount: 1,
  });

  assert.deepEqual(decision, { status: "allow", reason: "supabase-portfolio-ready" });
});

"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearPortfolioSnapshotCache } from "@/lib/data/portfolioSnapshotService";
import { setDataMode } from "@/lib/data/dataMode";
import { ONBOARDING_TRANSITION_KEY } from "@/lib/onboardingDecision";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

export const DEMO_AUTH_KEY = "demoAuth";

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithEmail: (email: string, password: string, redirectPath?: string) => Promise<{ error?: string; confirmationRequired?: boolean }>;
  signInWithGoogle: (redirectPath?: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      window.setTimeout(() => setLoading(false), 0);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      clearPortfolioSnapshotCache();
      if (data.session?.user) {
        setDataMode("supabase");
      }
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      clearPortfolioSnapshotCache();
      if (nextSession?.user) {
        setDataMode("supabase");
      }
      setSession(nextSession);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      async signInWithEmail(email, password) {
        if (!supabase) {
          return { error: "Supabase n’est pas encore configuré." };
        }

        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? { error: error.message } : {};
      },
      async signUpWithEmail(email, password, redirectPath = "/onboarding") {
        if (!supabase) {
          return { error: "Supabase n’est pas encore configuré." };
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
          },
        });

        if (error) {
          return { error: error.message };
        }

        if (data.session?.user) {
          setDataMode("supabase");
        }

        return { confirmationRequired: !data.session };
      },
      async signInWithGoogle(redirectPath = "/dashboard") {
        if (!supabase) {
          return { error: "Supabase n’est pas encore configuré." };
        }

        setDataMode("supabase");
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}${redirectPath}`,
          },
        });
        return error ? { error: error.message } : {};
      },
      async resetPassword(email) {
        if (!supabase) {
          return { error: "Supabase n’est pas encore configuré." };
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/connexion`,
        });
        return error ? { error: error.message } : {};
      },
      async signOut() {
        if (supabase) {
          await supabase.auth.signOut();
        }
        window.localStorage.removeItem(DEMO_AUTH_KEY);
        window.sessionStorage.removeItem(ONBOARDING_TRANSITION_KEY);
        clearPortfolioSnapshotCache();
        setSession(null);
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }

  return context;
}

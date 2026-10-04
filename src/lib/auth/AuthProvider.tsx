"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearPortfolioSnapshotCache } from "@/lib/data/portfolioSnapshotService";
import { setDataMode } from "@/lib/data/dataMode";
import { ONBOARDING_TRANSITION_KEY } from "@/lib/onboardingDecision";
import { getPublicAuthProviders, isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

export const DEMO_AUTH_KEY = "demoAuth";

type AuthContextValue = {
  configured: boolean;
  googleEnabled: boolean;
  loading: boolean;
  passwordRecovery: boolean;
  session: Session | null;
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithEmail: (email: string, password: string, redirectPath?: string) => Promise<SignUpResult>;
  signInWithGoogle: (redirectPath?: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

export type SignUpOutcome = "signed_in" | "verification_pending" | "indeterminate";
export type SignUpResult = { error?: string; errorCode?: string; outcome?: SignUpOutcome };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const sessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      window.setTimeout(() => setLoading(false), 0);
      return;
    }

    let cancelled = false;
    let sessionObserved = false;

    function applySession(nextSession: Session | null) {
      if (cancelled) {
        return;
      }

      sessionObserved = true;
      const nextUserId = nextSession?.user.id ?? null;

      if (sessionUserIdRef.current !== nextUserId) {
        sessionUserIdRef.current = nextUserId;
        clearPortfolioSnapshotCache();
      }

      if (nextUserId) {
        setDataMode("supabase");
      }

      setSession(nextSession);
      setLoading(false);
    }

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          if (!cancelled && !sessionObserved) {
            console.error("Impossible de récupérer la session Supabase.", error);
            setLoading(false);
          }
          return;
        }

        applySession(data.session);
      })
      .catch((error: unknown) => {
        if (!cancelled && !sessionObserved) {
          console.error("Impossible de récupérer la session Supabase.", error);
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      } else if (event === "SIGNED_OUT") {
        setPasswordRecovery(false);
      }

      applySession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let cancelled = false;
    void getPublicAuthProviders()
      .then((providers) => {
        if (!cancelled) {
          setGoogleEnabled(providers.google);
        }
      })
      .catch((error: unknown) => {
        console.error("Impossible de vérifier la disponibilité de Google Auth.", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      googleEnabled,
      loading,
      passwordRecovery,
      session,
      user: session?.user ?? null,
      async signInWithEmail(email, password) {
        if (!supabase) {
          return { error: "Le service de connexion n’est pas disponible pour le moment." };
        }

        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? { error: error.message } : {};
      },
      async signUpWithEmail(email, password, redirectPath = "/onboarding") {
        if (!supabase) {
          return { error: "Le service de connexion n’est pas disponible pour le moment." };
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
          },
        });

        if (error) {
          return { error: error.message, errorCode: error.code };
        }

        if (data.session?.user) {
          setDataMode("supabase");
          return { outcome: "signed_in" };
        }

        if (data.user?.identities?.length) {
          return { outcome: "verification_pending" };
        }

        return { outcome: "indeterminate" };
      },
      async signInWithGoogle(redirectPath = "/dashboard") {
        if (!supabase) {
          return { error: "Le service de connexion n’est pas disponible pour le moment." };
        }

        if (!googleEnabled) {
          return { error: "La connexion avec Google n’est pas disponible pour le moment." };
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
          return { error: "Le service de connexion n’est pas disponible pour le moment." };
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/mot-de-passe-oublie?mode=update`,
        });
        return error ? { error: error.message } : {};
      },
      async updatePassword(password) {
        if (!supabase) {
          return { error: "Le service de connexion n’est pas disponible pour le moment." };
        }

        const { error } = await supabase.auth.updateUser({ password });
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
    [googleEnabled, loading, passwordRecovery, session],
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

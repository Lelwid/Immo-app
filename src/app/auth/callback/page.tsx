"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const callbackError = useMemo(() => getCallbackError(searchParams), [searchParams]);
  const nextPath = getSafeRedirect(searchParams.get("next"));

  useEffect(() => {
    if (loading || callbackError || !user) {
      return;
    }

    router.replace(nextPath);
  }, [callbackError, loading, nextPath, router, user]);

  useEffect(() => {
    if (loading || user || callbackError) {
      return;
    }

    const timer = window.setTimeout(() => setTimedOut(true), 1800);
    return () => window.clearTimeout(timer);
  }, [callbackError, loading, user]);

  const errorMessage = callbackError
    ? "Ce lien de confirmation est invalide ou expiré. Demandez un nouveau lien ou connectez-vous si votre compte est déjà confirmé."
    : timedOut
      ? "Ce lien a déjà été utilisé ou ne peut plus confirmer le compte. Essayez de vous connecter."
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <p className="text-sm font-medium text-[var(--muted)]">Nexbail</p>
        <h1 className="mt-2 text-2xl font-semibold">Confirmation du courriel</h1>
        {errorMessage ? (
          <>
            <p className="mt-4 rounded-lg border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 p-4 text-sm leading-6 text-[color:var(--red)]" role="alert">
              {errorMessage}
            </p>
            <Link className="btn-primary mt-5 inline-flex" href="/connexion">
              Aller à la connexion
            </Link>
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]" role="status">
            Confirmation en cours… Vous serez redirigé vers Nexbail.
          </p>
        )}
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function getCallbackError(searchParams: URLSearchParams) {
  if (searchParams.get("error") || searchParams.get("error_code") || searchParams.get("error_description")) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return Boolean(hash.get("error") || hash.get("error_code") || hash.get("error_description"));
}

function getSafeRedirect(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/onboarding";
  }

  return value;
}

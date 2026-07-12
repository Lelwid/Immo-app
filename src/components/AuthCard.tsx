"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DEMO_AUTH_KEY, useAuth } from "@/lib/auth/AuthProvider";

type AuthMode = "connexion" | "inscription" | "reset";

export function AuthCard({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { configured, resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isReset = mode === "reset";
  const isSignup = mode === "inscription";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const result = isReset
      ? await resetPassword(email)
      : isSignup
        ? await signUpWithEmail(email, password)
        : await signInWithEmail(email, password);

    setSubmitting(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    if (isReset) {
      setMessage("Un courriel de réinitialisation a été envoyé si le compte existe.");
      return;
    }

    if (isSignup) {
      setMessage("Compte créé. Vérifiez votre courriel si la confirmation est activée.");
      return;
    }

    router.replace("/dashboard");
  }

  async function loginGoogle() {
    setSubmitting(true);
    const result = await signInWithGoogle();
    setSubmitting(false);

    if (result.error) {
      setMessage(result.error);
    }
  }

  function enterDemoMode() {
    window.localStorage.setItem(DEMO_AUTH_KEY, "true");
    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--muted)]">Gestionnaire Immo</p>
          <h1 className="mt-1 text-3xl font-semibold">
            {isReset ? "Mot de passe oublié" : isSignup ? "Créer un compte" : "Connexion"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {isReset
              ? "Recevez un lien pour réinitialiser votre mot de passe."
              : "Accédez à votre portefeuille immobilier sécurisé."}
          </p>
        </div>

        {!configured ? (
          <div className="mb-4 rounded-lg border border-[color:var(--yellow)]/40 bg-[color:var(--yellow)]/10 p-3 text-sm text-[color:var(--yellow)]">
            Supabase Auth n’est pas encore configuré. Ajoutez vos clés dans `.env.local`.
          </div>
        ) : null}

        <form className="grid gap-3" onSubmit={submit}>
          <TextInput label="Courriel" type="email" value={email} onChange={setEmail} />
          {!isReset ? <TextInput label="Mot de passe" type="password" value={password} onChange={setPassword} /> : null}
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || !email || (!isReset && !password)} type="submit">
            {submitting ? "Un instant..." : isReset ? "Envoyer le lien" : isSignup ? "S’inscrire" : "Se connecter"}
          </button>
        </form>

        {!isReset ? (
          <button className="btn-secondary mt-3 w-full" disabled={submitting} onClick={loginGoogle} type="button">
            Continuer avec Google
          </button>
        ) : null}

        {mode === "connexion" && !configured ? (
          <button className="btn-primary mt-3 w-full" onClick={enterDemoMode} type="button">
            Entrer en mode démo
          </button>
        ) : null}

        {message ? <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">{message}</p> : null}

        <div className="mt-6 grid gap-2 text-sm text-[var(--muted)]">
          {mode === "connexion" ? (
            <>
              <Link className="font-semibold text-[color:var(--accent)] hover:underline" href="/inscription">
                Créer un compte
              </Link>
              <Link className="font-semibold text-[color:var(--accent)] hover:underline" href="/mot-de-passe-oublie">
                Mot de passe oublié ?
              </Link>
            </>
          ) : (
            <Link className="font-semibold text-[color:var(--accent)] hover:underline" href="/connexion">
              Retour à la connexion
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}

function TextInput({
  label,
  onChange,
  type,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  type: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

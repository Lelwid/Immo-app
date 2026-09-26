"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DEMO_AUTH_KEY, useAuth } from "@/lib/auth/AuthProvider";

type AuthMode = "connexion" | "inscription" | "reset";

export function AuthCard({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { configured, loading, passwordRecovery, resetPassword, signInWithEmail, signInWithGoogle, signUpWithEmail, updatePassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("success");
  const [submitting, setSubmitting] = useState(false);
  const isReset = mode === "reset";
  const isSignup = mode === "inscription";
  const isPasswordUpdate = isReset && searchParams.get("mode") === "update";
  const recoveryLinkPending = isPasswordUpdate && loading;
  const recoveryLinkInvalid = isPasswordUpdate && !loading && !passwordRecovery;
  const redirectPath = getSafeRedirect(searchParams.get("redirect"), isSignup ? "/onboarding" : "/dashboard");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const validationMessage = validateAuthForm({ email, password, passwordConfirmation, isPasswordUpdate, isReset, isSignup });
    if (validationMessage) {
      setMessageTone("error");
      setMessage(validationMessage);
      return;
    }

    setSubmitting(true);
    setMessage("");

    const result: { error?: string; confirmationRequired?: boolean } = isPasswordUpdate
      ? await updatePassword(password)
      : isReset
        ? await resetPassword(email)
        : isSignup
          ? await signUpWithEmail(email, password, redirectPath)
          : await signInWithEmail(email, password);

    setSubmitting(false);

    if (result.error) {
      setMessageTone("error");
      setMessage(getFriendlyAuthError(result.error, mode));
      return;
    }

    if (isPasswordUpdate) {
      setMessageTone("success");
      setMessage("Votre mot de passe a été mis à jour.");
      return;
    }

    if (isReset) {
      setMessageTone("success");
      setMessage("Un courriel de réinitialisation a été envoyé si le compte existe.");
      return;
    }

    if (isSignup) {
      if (result.confirmationRequired) {
        setMessageTone("success");
        setMessage("Vérifiez votre courriel pour confirmer votre compte, puis revenez dans Nexbail.");
        return;
      }

      router.replace(redirectPath);
      return;
    }

    router.replace(redirectPath);
  }

  async function loginGoogle() {
    setSubmitting(true);
    const result = await signInWithGoogle(redirectPath);
    setSubmitting(false);

    if (result.error) {
      setMessageTone("error");
      setMessage(getFriendlyAuthError(result.error, mode));
    }
  }

  function enterDemoMode() {
    window.localStorage.setItem(DEMO_AUTH_KEY, "true");
    router.replace(redirectPath);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-3 py-[max(1rem,env(safe-area-inset-top))] text-[var(--foreground)] sm:px-4 sm:py-8">
      <section className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="mb-6">
          <p className="text-sm font-medium text-[var(--muted)]">Nexbail</p>
          <h1 className="mt-1 text-3xl font-semibold">
            {isPasswordUpdate ? "Créer un nouveau mot de passe" : isReset ? "Mot de passe oublié" : isSignup ? "Créer un compte" : "Connexion"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {isPasswordUpdate
              ? "Choisissez le nouveau mot de passe de votre compte Nexbail."
              : isReset
              ? "Recevez un lien pour réinitialiser votre mot de passe."
              : "Accédez à votre portefeuille immobilier sécurisé."}
          </p>
        </div>

        {!configured ? (
          <div className="mb-4 rounded-lg border border-[color:var(--yellow)]/40 bg-[color:var(--yellow)]/10 p-3 text-sm text-[color:var(--yellow)]">
            L’authentification est temporairement indisponible. Réessayez plus tard.
          </div>
        ) : null}

        {recoveryLinkPending ? (
          <p className="text-sm text-[var(--muted)]" role="status">
            Validation du lien de réinitialisation…
          </p>
        ) : recoveryLinkInvalid ? (
          <p className="rounded-lg border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 p-3 text-sm text-[color:var(--red)]" role="alert">
            Ce lien de réinitialisation est invalide ou expiré. Demandez un nouveau lien.
          </p>
        ) : (
          <form className="grid gap-3" onSubmit={submit}>
            {!isPasswordUpdate ? <TextInput autoComplete="email" label="Courriel" type="email" value={email} onChange={setEmail} /> : null}
            {isPasswordUpdate ? (
              <>
                <TextInput autoComplete="new-password" label="Nouveau mot de passe" minLength={8} type="password" value={password} onChange={setPassword} />
                <TextInput autoComplete="new-password" label="Confirmer le mot de passe" minLength={8} type="password" value={passwordConfirmation} onChange={setPasswordConfirmation} />
                <p className="text-xs text-[var(--muted)]">Au moins 8 caractères.</p>
              </>
            ) : !isReset ? (
              <>
                <TextInput autoComplete={isSignup ? "new-password" : "current-password"} label="Mot de passe" minLength={isSignup ? 8 : undefined} type="password" value={password} onChange={setPassword} />
                {isSignup ? <p className="text-xs text-[var(--muted)]">Au moins 8 caractères.</p> : null}
              </>
            ) : null}
            <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={submitting || (!isPasswordUpdate && !email) || (isPasswordUpdate && (!password || !passwordConfirmation)) || (!isReset && !password)} type="submit">
              {submitting ? "Un instant..." : isPasswordUpdate ? "Mettre à jour le mot de passe" : isReset ? "Envoyer le lien" : isSignup ? "S’inscrire" : "Se connecter"}
            </button>
          </form>
        )}

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

        {message ? (
          <p
            aria-live="polite"
            className={`mt-4 rounded-lg border p-3 text-sm ${
              messageTone === "error"
                ? "border-[color:var(--red)]/40 bg-[color:var(--red)]/10 text-[color:var(--red)]"
                : "border-[color:var(--green)]/35 bg-[color:var(--green)]/10 text-[var(--foreground)]"
            }`}
            role={messageTone === "error" ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}

        {isPasswordUpdate && messageTone === "success" && message ? (
          <Link className="btn-primary mt-3 inline-flex w-full justify-center" href="/dashboard">
            Accéder au tableau de bord
          </Link>
        ) : null}

        <div className="mt-6 grid gap-2 text-sm text-[var(--muted)]">
          {mode === "connexion" ? (
            <>
              <Link
                className="font-semibold text-[color:var(--accent)] hover:underline"
                href={redirectPath === "/dashboard" ? "/inscription" : `/inscription?redirect=${encodeURIComponent(redirectPath)}`}
              >
                Créer un compte
              </Link>
              <Link className="font-semibold text-[color:var(--accent)] hover:underline" href="/mot-de-passe-oublie">
                Mot de passe oublié ?
              </Link>
            </>
          ) : (
            <Link
              className="font-semibold text-[color:var(--accent)] hover:underline"
              href={redirectPath === "/onboarding" ? "/connexion" : `/connexion?redirect=${encodeURIComponent(redirectPath)}`}
            >
              Retour à la connexion
            </Link>
          )}
        </div>
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
          En utilisant Nexbail, vous acceptez les <Link className="underline" href="/conditions">conditions d’utilisation</Link> et reconnaissez la <Link className="underline" href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>
    </main>
  );
}

function getSafeRedirect(value: string | null, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

function TextInput({
  autoComplete,
  label,
  minLength,
  onChange,
  type,
  value,
}: {
  autoComplete?: string;
  label: string;
  minLength?: number;
  onChange: (value: string) => void;
  type: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        autoComplete={autoComplete}
        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[color:var(--accent)]"
        minLength={minLength}
        name={type === "email" ? "email" : "password"}
        required
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function validateAuthForm({
  email,
  isPasswordUpdate,
  isReset,
  isSignup,
  password,
  passwordConfirmation,
}: {
  email: string;
  isPasswordUpdate: boolean;
  isReset: boolean;
  isSignup: boolean;
  password: string;
  passwordConfirmation: string;
}) {
  if (!isPasswordUpdate && !/^\S+@\S+\.\S+$/.test(email.trim())) {
    return "Entrez une adresse courriel valide.";
  }

  if (isPasswordUpdate && password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }

  if (isPasswordUpdate && password !== passwordConfirmation) {
    return "Les mots de passe ne correspondent pas.";
  }

  if (!isReset && !password) {
    return "Entrez votre mot de passe.";
  }

  if (isSignup && password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères.";
  }

  return "";
}

function getFriendlyAuthError(error: string, mode: AuthMode) {
  const normalized = error.toLowerCase();

  if (normalized.includes("invalid login credentials") || normalized.includes("invalid credentials")) {
    return "Courriel ou mot de passe incorrect.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirmez votre courriel avant de vous connecter.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
    return "Un compte existe déjà avec ce courriel. Essayez de vous connecter.";
  }

  if (normalized.includes("password") && (normalized.includes("short") || normalized.includes("least"))) {
    return "Le mot de passe ne respecte pas les exigences de sécurité.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Trop de tentatives. Attendez quelques minutes avant de réessayer.";
  }

  if (mode === "inscription") {
    return "Impossible de créer le compte. Vérifiez les informations et réessayez.";
  }

  if (mode === "reset") {
    return "Impossible d’envoyer le courriel. Réessayez dans quelques instants.";
  }

  return "Impossible de vous connecter. Réessayez dans quelques instants.";
}

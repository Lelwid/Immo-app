"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Nexbail UI] Erreur inattendue.", { digest: error.digest }); }, [error]);
  return <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6 text-[var(--foreground)]"><section className="max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center"><h1 className="text-2xl font-semibold">Un problème est survenu</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Vos données n’ont pas été modifiées. Réessayez dans quelques instants.</p><button className="btn-primary mt-6" onClick={reset} type="button">Réessayer</button></section></main>;
}

import Link from "next/link";

export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6 text-[var(--foreground)]"><section className="max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center"><p className="text-sm font-semibold text-[var(--muted)]">Erreur 404</p><h1 className="mt-2 text-3xl font-semibold">Page introuvable</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Cette page n’existe pas ou n’est plus disponible.</p><Link className="btn-primary mt-6 inline-flex" href="/dashboard">Retour au tableau de bord</Link></section></main>;
}

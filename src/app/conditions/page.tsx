import Link from "next/link";

export const metadata = { title: "Conditions d’utilisation | Nexbail" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
      <article className="mx-auto max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-10 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:leading-7 [&_p]:text-[var(--muted)]">
        <Link className="text-sm font-semibold text-[color:var(--accent)] hover:underline" href="/connexion">← Retour à Nexbail</Link>
        <h1 className="mt-5 text-3xl font-semibold">Conditions d’utilisation</h1>
        <p>Version bêta privée · Mise à jour : 24 septembre 2026</p>
        <h2>Service bêta</h2>
        <p>Nexbail est fourni à un groupe limité de testeurs afin d’évaluer un logiciel de gestion immobilière. Le service peut évoluer, être interrompu ou contenir des erreurs pendant cette période.</p>
        <h2>Compte et utilisation autorisée</h2>
        <p>Vous êtes responsable de votre compte, de la confidentialité de vos accès et de l’exactitude des données saisies. Vous devez disposer des droits nécessaires pour traiter les renseignements et documents ajoutés au service.</p>
        <h2>Données financières et intelligence artificielle</h2>
        <p>Les calculs, rappels et réponses du Copilot servent d’aide à la gestion. Ils doivent être vérifiés avant toute décision importante. Nexbail ne fournit pas de conseil juridique, fiscal ou comptable.</p>
        <h2>Disponibilité et responsabilité</h2>
        <p>Le service est fourni pour évaluation pendant la bêta, sans garantie de disponibilité continue. Signalez rapidement toute erreur importante au moyen de « Donner mon avis ».</p>
        <h2>Fin d’accès</h2>
        <p>L’accès à la bêta peut être suspendu en cas d’usage abusif, de risque de sécurité ou à la fin du programme. Les demandes concernant l’accès, l’export ou la suppression des données doivent être transmises par le canal fourni aux testeurs.</p>
        <p className="border-t border-[var(--border)] pt-6">Ces conditions sont une version de lancement minimale. Une validation juridique professionnelle est recommandée avant un lancement public.</p>
      </article>
    </main>
  );
}

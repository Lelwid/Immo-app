import Link from "next/link";

export const metadata = { title: "Politique de confidentialité | Nexbail" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updated="24 septembre 2026">
      <p>Nexbail est actuellement offert dans le cadre d’une bêta privée au Canada, notamment au Québec. Cette politique décrit les grandes catégories de renseignements traités pour fournir le service.</p>
      <h2>Renseignements traités</h2>
      <p>Nous traitons les renseignements de compte et les données saisies dans Nexbail, dont les immeubles, logements, locataires, baux, paiements, documents et demandes d’entretien. Les testeurs doivent utiliser uniquement des renseignements qu’ils sont autorisés à gérer.</p>
      <h2>Utilisation et fournisseurs techniques</h2>
      <p>Ces renseignements servent à fournir, sécuriser, diagnostiquer et améliorer Nexbail. L’hébergement, l’authentification, la base de données, le stockage, l’envoi de courriels et certaines fonctions d’intelligence artificielle reposent sur des fournisseurs techniques. Lorsqu’une fonction IA est utilisée, le contenu nécessaire à la demande peut être transmis au fournisseur IA configuré.</p>
      <h2>Sécurité et accès</h2>
      <p>Nexbail applique des contrôles d’accès par compte et conserve les fichiers privés dans des espaces non publics. Aucun système ne peut toutefois garantir une sécurité absolue.</p>
      <h2>Conservation et suppression</h2>
      <p>Les données sont conservées pendant la bêta selon les besoins du service et des essais. Certaines données liées à un historique financier ou locatif peuvent être archivées plutôt que supprimées. Une demande de suppression ou d’accès peut être transmise depuis la fonction « Donner mon avis » de l’espace connecté.</p>
      <h2>Nous joindre</h2>
      <p>Pour une question de confidentialité pendant la bêta, utilisez « Donner mon avis » dans Nexbail ou le canal de communication fourni avec votre invitation.</p>
    </LegalPage>
  );
}

function LegalPage({ children, title, updated }: { children: React.ReactNode; title: string; updated: string }) {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
      <article className="mx-auto max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-10 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mt-3 [&_p]:leading-7 [&_p]:text-[var(--muted)]">
        <Link className="text-sm font-semibold text-[color:var(--accent)] hover:underline" href="/connexion">← Retour à Nexbail</Link>
        <h1 className="mt-5 text-3xl font-semibold">{title}</h1>
        <p>Version bêta privée · Mise à jour : {updated}</p>
        {children}
        <p className="border-t border-[var(--border)] pt-6">Cette politique est une version de lancement minimale. Une validation juridique professionnelle est recommandée avant un lancement public.</p>
      </article>
    </main>
  );
}
